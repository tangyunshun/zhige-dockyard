"use strict";
async (overrides) => {
    const execCompId = overrides?.componentId || quickSelectedCompId;
    const execInputMaterial = overrides?.inputMaterial ?? quickInputMaterial;
    const execMaterialInputMode = overrides?.materialInputMode || materialInputMode;
    const execUploadedFileMeta = overrides?.uploadedFileMeta !== undefined ? overrides.uploadedFileMeta : uploadedFileMeta;
    const execSelectedAsset = overrides?.selectedAsset !== undefined ? overrides.selectedAsset : selectedAsset;
    if (!execCompId) {
        toast.error("请先选择要运行的组件！");
        return;
    }
    const execComp = componentCatalog.find(c => c.id === execCompId);
    const execInputMode = execComp?.inputMode || "text";
    const hasText = execInputMaterial.trim().length > 0;
    const hasFile = execMaterialInputMode === "file" && !!execUploadedFileMeta;
    const hasAsset = execMaterialInputMode === "asset" && !!execSelectedAsset;
    // 结构化表单（合同输入为 STRUCTURED_FORM）：以合同声明字段为准做前端必填校验，提交 formData
    const execStructuredFields = execComp?.inputContractKind === "STRUCTURED_FORM"
        ? (execComp?.formConstraints?.fields ?? [])
        : [];
    const execIsStructuredForm = execStructuredFields.length > 0;
    let inputErr = "";
    if (execIsStructuredForm) {
        for (const fdef of execStructuredFields) {
            const v = quickFormData[fdef.name];
            if (fdef.required && !String(v ?? "").trim()) {
                inputErr = `请填写必填项「${fdef.label || fdef.name}」`;
                break;
            }
        }
    }
    else if (execInputMode === "file") {
        if (!hasFile && !hasAsset)
            inputErr = "该组件需要上传文件或选择空间资料作为主材料，纯文本粘贴不允许执行";
    }
    else if (execInputMode === "text") {
        if (!hasText && !hasAsset)
            inputErr = "请输入待处理的研发源材料，或选择空间资料";
    }
    else {
        if (!hasText && !hasFile && !hasAsset)
            inputErr = "请输入文本、上传文件或选择空间资料作为主材料";
    }
    if (inputErr) {
        // 材料类错误行内提示 + 输入区高亮（合同未就绪 / 点数不足等非材料类错误仍走 toast）
        setMaterialValidationError(inputErr);
        toast.error(inputErr);
        return;
    }
    // 文本最小长度合同校验（前端前置拦截，与后端 INPUT_TOO_SHORT 同口径）
    if (!execIsStructuredForm && !inputErr) {
        const minTextChars = execComp?.textConstraints?.minLength;
        if (typeof minTextChars === "number" &&
            minTextChars > 0 &&
            hasText &&
            execInputMaterial.trim().length < minTextChars) {
            const shortErr = `内容不足：该组件要求材料至少 ${minTextChars} 字，当前仅 ${execInputMaterial.trim().length} 字，请补充后再执行`;
            setMaterialValidationError(shortErr);
            return;
        }
    }
    const estimatedCost = Number(componentCatalog.find(c => c.id === execCompId)?.estimatedModelTokens) || 0;
    const selectedComp = componentCatalog.find(c => c.id === execCompId);
    const taskName = `${selectedComp?.name || "组件"}自动化任务`;
    const finalExecInputMaterial = execInputMaterial.trim();
    let inputSource = { sourceType: "text" };
    if (execMaterialInputMode === "file" && execUploadedFileMeta) {
        inputSource = {
            sourceType: "file",
            sourceId: null,
            fileName: execUploadedFileMeta.name,
            fileSize: execUploadedFileMeta.sizeBytes ?? null,
        };
    }
    else if (execMaterialInputMode === "asset" && execSelectedAsset) {
        inputSource = {
            sourceType: "asset",
            sourceId: execSelectedAsset.id,
            fileName: execSelectedAsset.title,
            fileSize: null,
        };
    }
    if (workspaceType === "ENTERPRISE" && !isManager && restrictedComponentIds.includes(execCompId)) {
        toast.error("无法执行：当前岗位无权运行该组件");
        return;
    }
    // 合同诚实化：无有效 PUBLISHED 激活合同一律拦截，绝不发送 Studio 执行请求、绝不产生模拟结果
    const execCompDef = componentCatalog.find((c) => c.id === execCompId);
    if (execCompDef && execCompDef.contractReady !== true) {
        toast.error(execCompDef.activeContractLifecycle === "DRAFT"
            ? "暂不可执行：该组件合同还在草稿状态，即将上线"
            : execCompDef.activeContractLifecycle === "ARCHIVED"
                ? "暂不可执行：该组件合同已归档"
                : "暂不可执行：该组件还没有配置可执行合同");
        return;
    }
    // 执行前扣点预估：一律取算账中心估价接口，严禁把 estimatedModelTokens（Token 估算）当点数。
    // 估价不可用时 gateCost 为 null → 不做前端"点数不足"拦截（后端 execute 仍会按同一真源裁决并兜底退款），
    // 避免拿 Token 数（动辄数万）与算力点余额比较造成企业空间误拦截。
    let gateCost = null;
    try {
        const token = getAuthToken();
        const params = new URLSearchParams({
            componentId: execCompId || "",
            workspaceId: String(workspaceId || ""),
        });
        const estRes = await fetch(`/api/billing/estimate?${params.toString()}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            cache: "no-store",
        });
        const estJson = await estRes.json().catch(() => null);
        // [R0-I / 原方案 F12] BYOK 暂停事实与执行准入一致：blocked/canExecute=false 时
        // points/yuan 为 null（不构成可扣点报价），直接以暂停提示终止本次执行，不进入扣点流程。
        if (estJson?.data?.blocked || estJson?.data?.canExecute === false) {
            toast.error(estJson?.data?.message ||
                "自带模型（BYOK）的任务调用暂不可用：平台收费口径待确认。本次未扣点、未调用模型。");
            setIsExecutingTask(false);
            return;
        }
        const estPoints = estJson?.data?.points;
        if (typeof estPoints === "number" && estPoints > 0)
            gateCost = estPoints;
    }
    catch {
        // 估价不可用 → 不阻断执行，交由后端按真实扣点裁决
    }
    if (workspaceType === "ENTERPRISE" &&
        gateCost != null &&
        availableTokenForUser !== -1 &&
        availableTokenForUser < gateCost) {
        if (isMemberView) {
            // 企业成员自身余额不足：不在此拦截，交给后端裁决；若个人钱包可支付，后端会返回可个人点支付的提示
        }
        else {
            toast.error(`空间剩余额度不足：需要 ${gateCost} 算力点，请联系空间管理员`);
            return;
        }
    }
    setIsExecutingTask(true);
    // 先请求后端真实执行（扣费 / 写入任务历史 / 审计闭环），成功后才更新本地状态
    try {
        const execFile = execMaterialInputMode === "file" ? (execUploadedFileMeta?.file || null) : null;
        const res = execFile
            ? await (() => {
                // 文件任务：multipart 上传原始 File，文本由服务端解析（不发送客户端读取的文本）
                const fd = new FormData();
                fd.append("action", "simulate");
                fd.append("workspaceId", workspaceId);
                fd.append("componentId", execCompId);
                fd.append("taskName", taskName);
                fd.append("inputSource", JSON.stringify(inputSource));
                fd.append("payWithPersonal", overrides?.payWithPersonal ? "true" : "false");
                fd.append("file", execFile);
                return fetch("/api/studio", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${getAuthToken()}` },
                    credentials: "include",
                    body: fd,
                });
            })()
            : await fetch("/api/studio", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${getAuthToken()}`,
                },
                credentials: "include",
                body: JSON.stringify({
                    action: "simulate",
                    workspaceId,
                    componentId: execCompId,
                    taskName,
                    inputMaterial: finalExecInputMaterial,
                    inputSource,
                    // 知识引用带入执行：仅透传被引用条目标题用于结果页展示，内容本身走标准 text 通道
                    refKnowledgeTitle: refKnowledgeTitle || undefined,
                    payWithPersonal: overrides?.payWithPersonal || false,
                    // 结构化表单组件：以 formData 提交（服务端按合同字段强校验）
                    ...(execIsStructuredForm ? { formData: quickFormData } : {}),
                }),
            });
        const data = await res.json();
        if (!res.ok || !data.success) {
            // 企业成员算力点不足、且可用个人点支付：弹出个人点支付确认框，确认后用个人算力点重试
            if (data.code === "POINTS_INSUFFICIENT" && data.canPayWithPersonal) {
                setPersonalPayInfo({
                    requiredPoints: typeof data.personalRequired === "number" ? data.personalRequired : (gateCost ?? 0),
                    availablePoints: typeof data.personalAvailable === "number" ? data.personalAvailable : 0,
                    componentName: selectedComp?.name || "组件",
                    taskName,
                });
                setShowPersonalPayModal(true);
                setIsExecutingTask(false);
                return;
            }
            throw new Error(data.error || data.message || "任务执行失败，请稍后重试");
        }
        // 后端执行成功，任务 ID / 状态 / 产出结果一律使用服务端返回的真实数据。
        // 若 success=true 但缺少真实 task.id，视为接口契约错误：
        // 不插入 recentTasks、不显示任务成功，记录接口响应结构并给出明确错误提示。
        const backendTask = data.task;
        if (!backendTask || !backendTask.id) {
            console.error("[WorkspaceLayout] simulate 接口契约错误：success=true 但缺少真实 task.id，接口响应结构:", JSON.stringify(data));
            setIsExecutingTask(false);
            toast.error("任务执行成功但接口未返回任务记录（契约异常），请刷新后到结果中心查看");
            return;
        }
        // POST 成功只提取 taskId / 状态 / 最小展示元数据，严禁直接消费 backendTask.result 或 backendTask.outputData；
        // 随后立即请求 task_detail 安全 DTO 覆盖 ResultViewer（见 openHistoryTaskDetail）。
        const newTask = {
            id: backendTask.id,
            name: backendTask.name || taskName,
            componentId: execCompId,
            componentName: selectedComp?.name || "",
            pointsCost: typeof backendTask.estimatedPoints === "number" ? backendTask.estimatedPoints : (typeof backendTask.tokens === "number" ? backendTask.tokens : 0),
            status: normalizeTaskStatus(backendTask.status || "SUCCESS"),
            time: backendTask.createdAt ? new Date(backendTask.createdAt).toLocaleString("zh-CN", { hour12: false }) : "刚刚",
            contractVersion: data.contractVersion ?? null,
        };
        setRecentTasks(prev => [newTask, ...prev]);
        if (typeof data.tokenBalance === "number") {
            setWorkspaceToken(data.tokenBalance);
        }
        else {
            setWorkspaceToken(prev => Math.max(0, prev - newTask.pointsCost));
        }
        setIsExecutingTask(false);
        // 立即请求 task_detail，用安全 DTO 覆盖 ResultViewer，绝不把 POST 响应渲染成成功结果页
        await openHistoryTaskDetail(newTask);
        setQuickResultHistoryOpen(false);
        // 执行成功后清空输入来源状态，避免下次任务串数据（单一主材料）
        setQuickInputMaterial("");
        setQuickFormData({});
        setUploadedFileMeta(null);
        setUploadedFiles([]);
        setSelectedAsset(null);
        setMaterialInputMode("text");
        if (fileInputRef.current)
            fileInputRef.current.value = "";
        toast.success("数据自动化处理完毕！分析结果已生成。");
    }
    catch (error) {
        console.error("执行自动化任务失败:", error);
        setIsExecutingTask(false);
        toast.error(error.message || "任务执行失败，请联系空间管理员");
    }
};
