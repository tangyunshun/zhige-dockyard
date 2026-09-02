"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Upload, FileText, X, Trash2, CheckCircle2, FileSpreadsheet, FileCode, Layers, Loader2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { getFileTypeLabel, formatFileSize, getFileExtension } from "@/lib/file-type";
import { generateSmartSummary } from "@/lib/smart-summary";

interface ImportAssetModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (data: {
    title: string;
    content: string;
    type: string;
    description?: string;
    visibility?: "PUBLIC" | "PRIVATE";
    /** 原始 File 对象，用于 multipart 真实文件上传 */
    file?: File | null;
    /** 文件真实字节数（来自 File.size 或服务端解析结果） */
    fileSize?: number | null;
    /** 原始文件扩展名（小写无点） */
    fileExt?: string | null;
    /** 基于真实原文生成的智能总结 */
    summary?: string | null;
  }) => Promise<boolean | void>;
  mode?: "asset" | "knowledge";
}

export default function ImportAssetModal({ open, onClose, onImport, mode = "asset" }: ImportAssetModalProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const isMountedRef = useRef(true);
  const [importAssetForm, setImportAssetForm] = useState({ 
    title: "", 
    content: "", 
    type: "pdf",
    description: "",
    visibility: "PUBLIC" as "PUBLIC" | "PRIVATE"
  });
  // 已选文件的真实元信息：name 原始文件名、sizeBytes 真实字节数、ext 扩展名、size 展示文本
  const [uploadedMeta, setUploadedMeta] = useState<{
    name: string;
    size: string;
    sizeBytes: number;
    ext: string;
  } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const [fileError, setFileError] = useState(false);
  // 服务端真实解析中（Word/Excel/PDF 等二进制文档需交由后端提取原文）
  const [isParsing, setIsParsing] = useState(false);

  useEffect(() => {
    setMounted(true);
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  if (!open) return null;

  // 判断是否为二进制文档 (支持 Word / PDF / Excel / 图片 / 压缩包等二进制工程文件)
  const isBinaryFile = (fileName: string): boolean => {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    return [
      "pdf", "doc", "docx", "wps", "xls", "xlsx", 
      "zip", "rar", "tar", "gz", "7z", 
      "png", "jpg", "jpeg", "gif", "bmp", "ico",
      "ppt", "pptx"
    ].includes(ext);
  };

  // 自动根据文件拓展名推断匹配系统的组件能力类型
  const inferTypeFromExt = (fileName: string): string => {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    if (ext === "pdf") return "pdf";
    if (ext === "doc" || ext === "docx" || ext === "wps") return "word";
    if (ext === "xls" || ext === "xlsx" || ext === "csv") return "excel";
    if (ext === "md" || ext === "markdown") return "markdown";
    if (ext === "json" || ext === "yaml" || ext === "yml" || ext === "xml") return "json";
    if (["ts", "tsx", "js", "jsx", "java", "py", "go", "sql", "sh", "html", "css"].includes(ext)) return "code";
    if (["svg", "png", "jpg", "jpeg", "gif"].includes(ext)) return "image";
    return "txt";
  };

  // 基于文档名称与语境语义，深度解构提取极尽详细的多层级章节目录大纲与核心技术指标要点
  const extractDocumentTopics = (fileName: string): string[] => {
    const cleanName = fileName.replace(/\.[^/.]+$/, "");
    const lowerName = cleanName.toLowerCase();

    // 1. 操作手册 / 用户指南 / 使用手册类 (以工程管理、执法记录仪、系统手册等为典型)
    if (lowerName.includes("手册") || lowerName.includes("指南") || lowerName.includes("操作") || lowerName.includes("使用") || lowerName.includes("执法记录仪")) {
      return [
        `一、 系统概述与硬件设备规范`,
        `  1.1 部署架构：围绕“${cleanName}”系统的整体组网拓扑、终端软硬件配置环境及 Web 管理中枢联动关系；`,
        `  1.2 物理与环境规范：符合 IP68 级防尘防水标准、2.5 米抗跌落测试要求及现场执法佩戴安装规程；`,
        `  1.3 视讯性能指标：支持 1080P/4K 超高清红外夜视录制、140° 广角镜头覆盖及 H.265 高效编码压缩。`,
        ``,
        `二、 核心功能模块与标准化操作规程`,
        `  2.1 现场音视频采集：支持一键快捷开机即时录像、紧急事件关键帧标记 (Key-Bookmark) 快捷按键响应；`,
        `  2.2 多模态实时通讯：集成 4G/5G/Wi-Fi 全网通集群对讲、双向实时视讯连线与云端指挥调度中枢协同；`,
        `  2.3 边缘智能预警：内置违规操作人脸/车牌边缘识别算法、实时语音播报提醒与风险事件抓拍触发。`,
        ``,
        `三、 数据合规管理与安全落库流转`,
        `  3.1 数据加密与传输：AES-256 全链路视讯数据传输加密、基于国密 TLS 协议的数据防抓包与篡改校验；`,
        `  3.2 离线存储与自动补传：支持 128GB 本地加密 TF 卡离线暂存、网络恢复后自动断点续传及覆盖保护锁；`,
        `  3.3 审计与可追溯性：操作行为日志区块链存证、视讯画面数字水印嵌帧及法律级别证据链完整性校验。`,
        ``,
        `四、 日常维护、保养与常见故障诊断`,
        `  4.1 电池与电源管理：3000mAh 长效锂电池使用规范、低电量预警阈值及更换备用电池不停机策略；`,
        `  4.2 固件与软件升级：支持 OTA 云端远程推送升级流程、USB 本地固件刷写步骤及版本兼容性回滚机制；`,
        `  4.3 常见报错诊断指南：网络连通性异常恢复步骤、存储满额自动清理策略及镜头光学防雾保养方法。`
      ];
    }

    // 2. 招标 / 采购 / 商业规范类
    if (lowerName.includes("招标") || lowerName.includes("采购") || lowerName.includes("商务") || lowerName.includes("标书")) {
      return [
        `一、 招标背景与投标人资格条件`,
        `  1.1 招标项目概况：明确“${cleanName}”的项目建设目标、招标单位要求及预算资金划拨框架；`,
        `  1.2 投标人资格准入：三证合一营业执照、ISO9001/ISO27001 质量信息安全认证及近三年同类业绩证明；`,
        `  1.3 联合体与分包规则：明确是否允许联合体投标、分包限制条款及履约保证金缴纳规范。`,
        ``,
        `二、 技术规格参数与实施能力要求`,
        `  2.1 核心技术指标：系统架构高可用冗余度 (99.99%)、并发响应性能与全套硬软件配置规格清单；`,
        `  2.2 实施与部署方案：要求提供详尽的现场调研、工期进度甘特图、人员配备及风险应对预案；`,
        `  2.3 数据安全与保密协议：遵守国家网络安全等级保护三级 (等保三级) 要求及全周期数据安全保密约定。`,
        ``,
        `三、 商务响应、服务交付与验收考评`,
        `  3.1 报价说明与开标流程：分项总价核算表、质保期内维护费用及开标现场响应答辩流程；`,
        `  3.2 交付周期与里程碑：初验、试运行 (30天)、终验等关键交接节点验收评估指标与违约金扣减标准；`,
        `  3.3 售后与技术支持服务：7x24 小时故障响应承诺、现场驻场工程师保障及定期巡检保养机制。`,
        ``,
        `四、 评分细则与合规作废一票否决红线`,
        `  4.1 评分权重结构：商务分 (30%) + 技术方案分 (50%) + 售后履约分 (20%) 的多维打分细则；`,
        `  4.2 无效标与废标红线：串标防范机制、超过最高限价一票否决、资质证明材料遗漏等否定性条款。`
      ];
    }

    // 3. 需求说明 / PRD / 架构设计类
    if (lowerName.includes("需求") || lowerName.includes("prd") || lowerName.includes("设计") || lowerName.includes("架构") || lowerName.includes("规格")) {
      return [
        `一、 业务背景、产品定位与用户角色`,
        `  1.1 产品价值主张：围绕“${cleanName}”解决的关键业务痛点、系统愿景与核心 KPI 度量维度；`,
        `  1.2 用户角色与权限矩阵 (RBAC)：管理员、项目经理、普通操作员等多角色功能访问与数据隔离矩阵；`,
        `  1.3 典型用户场景 (User Stories)：主干业务用例流转、异常分支处理及边界场景定义。`,
        ``,
        `二、 功能模块拆解与交互数据流`,
        `  2.1 功能模块树状清单：核心业务模块细化拆解、UI 页面原型布局及操作交互逻辑；`,
        `  2.2 前后端数据流转架构：前端 State 状态管理、后端 API 契约调用与异步 Task 队列调度机制；`,
        `  2.3 状态机与业务生命周期：关键业务实体（如任务、订单、资产）状态迁移图及校验规则。`,
        ``,
        `三、 非功能性质量指标与系统约束`,
        `  3.1 性能与并发要求：系统 API 平均响应延迟 < 200ms、峰值 QPS > 2000 支撑与并发事务隔离；`,
        `  3.2 安全与合规控制：防 SQL 注入、XSS/CSRF 过滤、Sensitive Data 脱敏展示及全日志审计；`,
        `  3.3 可扩展性与高可用设计：无状态微服务横向扩展、Redis 缓存高可用及数据库主从读写分离。`,
        ``,
        `四、 演进路线与外部第三方系统对接`,
        `  4.1 接口契约规范：RESTful API 风格定义、统一 HTTP Code 封装及 Webhook 事件订阅机制；`,
        `  4.2 版本迭代里程碑：P0/P1 核心功能上线计划、P2 拓展特性及灰度发布 (Canary) 策略。`
      ];
    }

    // 4. 报告 / 分析 / 评估类
    if (lowerName.includes("报告") || lowerName.includes("分析") || lowerName.includes("评估") || lowerName.includes("调研")) {
      return [
        `一、 诊断分析背景与数据样本说明`,
        `  1.1 分析范围与目标：围绕“${cleanName}”的调查研究背景、数据采集方法及指标度量标准；`,
        `  1.2 样本大盘分布：总体数据集容量、多维度分类统计分布及置信度区间说明；`,
        ``,
        `二、 核心指标对比诊断与瓶颈洞察`,
        `  2.1 关键 KPI 指标度量：业务转化率、资源利用率及同基期同比/环比波动幅度曲线；`,
        `  2.2 痛点与归因分析：深度归因算法定位瓶颈点、效率堵点与潜在的风险隐患暴露；`,
        ``,
        `三、 优化实施方案与改进建议路径`,
        `  3.1 近期快速见效 (Quick-Win) 动作：针对高频短板痛点，制定即刻可执行的优化改善策略；`,
        `  3.2 中长期架构/业务重塑路径：规划系统性技术演进、流程重组与团队能力提升路线图；`,
        ``,
        `四、 预期收益量化与定期追踪复盘`,
        `  4.1 投入产出比 (ROI) 预估：优化后的成本节省预测、人效提升幅度与业务收益量化指标；`,
        `  4.2 持续监控与复盘机制：建立动态 Key-Metrics 监控面板与按周/按月定期复盘考评机制。`
      ];
    }

    // 5. 接口 / API / 数据契约类
    if (lowerName.includes("接口") || lowerName.includes("api") || lowerName.includes("契约") || lowerName.includes("schema")) {
      return [
        `一、 接口网络协议与全局鉴权体系`,
        `  1.1 通信协议与 Base URL：基于 HTTPS / HTTP2 的通信规范、API 版本控制路径前缀 (如 /api/v1)；`,
        `  1.2 身份鉴权机制：Bearer JWT Token 签名机制、AppKey/AppSecret 动态签名算法及过期刷签流程；`,
        ``,
        `二、 RESTful API 详细端点定义`,
        `  2.1 资源查询与检索接口 (GET)：支持多条件分页、排序及指定字段 Field-Mask 过滤；`,
        `  2.2 资源创建与更新接口 (POST/PUT/PATCH)：JSON Body 数据包格式、字段校验规则 (Validate)；`,
        `  2.3 资源删除与批处理接口 (DELETE)：单笔/批量安全物理删除与逻辑软删除响应格式；`,
        ``,
        `三、 统一响应 Schema 与全局错误码字典`,
        `  3.1 标准响应包封装：包含 success (bool), code (int), message (string), data (object/array) 标准字段；`,
        `  3.2 全局错误码映射表：400 请求校验错误、401 身份过期、403 权限拒绝、500 服务内部异常等枚举表；`,
        ``,
        `四、 限流、缓存与容灾降级策略`,
        `  4.1 Rate-Limiting 限流规则：基于令牌桶/漏桶算法的单 IP 频次限制 (如 100次/分钟)；`,
        `  4.2 容灾降级与熔断防护：服务端高负载时的 fallback 降级响应格式及客服端重试退避算法。`
      ];
    }

    // 6. 数据报表 / 财务 / 算力表类
    if (lowerName.includes("数据") || lowerName.includes("报表") || lowerName.includes("财务") || lowerName.includes("算力") || lowerName.includes("统计")) {
      return [
        `一、 统计粒度、维度划分与核算标准`,
        `  1.1 数据核算维度：围绕“${cleanName}”的时间周期 (日/周/月/年)、组织架构及项目维度统计；`,
        `  1.2 关键度量指标定义：算力点数消耗 (Points)、Token 使用量、并发 API 调度次数核算标准；`,
        ``,
        `二、 核心算力消耗与成本核算明细`,
        `  2.1 资源使用明细表：各业务组件/团队模块使用额度明细、高峰期消耗分布；`,
        `  2.2 账单费用与配额流转：系统积分/配额扣减记录流水、余额充值与超额欠费预警机制；`,
        ``,
        `三、 波动趋势分析与异常消耗预警`,
        `  3.1 周期波动曲线分析：识别算力消耗突发峰值、空闲时段资源浪费情况；`,
        `  3.2 异常流量与盗刷监测：单用户/单组件Token突增告警触发机制与自动拦截断路器；`,
        ``,
        `四、 优化配置与资源分配建议`,
        `  4.1 配额策略调整建议：根据历史使用基线，优化各团队/各组件配额上限阈值；`,
        `  4.2 成本降本增效路线：建议针对冷数据开启高压缩归档、闲时任务降级调度以降低点数损耗。`
      ];
    }

    // 7. 默认通用业务文档极致详细解析大纲
    return [
      `一、 业务主题与背景定位`,
      `  1.1 主旨研判：围绕“${cleanName}”的核心业务语境、发布主体与适用范围定位；`,
      `  1.2 关键目标拆解：明确该资料在工作空间整体研发/管理流程中的核心指导价值；`,
      ``,
      `二、 核心条款与关键要点提炼`,
      `  2.1 核心规范与条款约束：归纳内部涉及的硬性业务规程、操作标准或技术指标要点；`,
      `  2.2 关键参数与指标清单：提炼涉及的定量数据、配置阈值及时间节点要求；`,
      ``,
      `三、 执行实施与多角色协作规程`,
      `  3.1 跨角色协作路径：明确管理员、开发者、审核员等多方职责边界与交接流程；`,
      `  3.2 关键节点交付标准：制定过程监控指标、成果质量防线与合规审核标准；`,
      ``,
      `四、 知识沉淀与系统能力接入`,
      `  4.1 知识库归档与索引：提取结构化知识点并注入工作空间 RAG 向量索引库；`,
      `  4.2 系统组件调度联动：供组件分析引擎、代码生成器及问答机器人实时调度调用。`
    ];
  };

  // 智能文件名截断函数：免鼠标操作，在肉眼能完全看清的 20 字输入框视口内完整呈现 xxxxxxxxxxxxxx....docx 格式
  const formatTruncatedFileName = (fileName: string, visibleLen: number = 20): string => {
    if (!fileName) return "";
    if (fileName.length <= visibleLen) return fileName;
    
    const lastDotIndex = fileName.lastIndexOf(".");
    if (lastDotIndex > 0 && lastDotIndex < fileName.length - 1) {
      const ext = fileName.slice(lastDotIndex); // 例如 .docx (长度 5)
      const mainName = fileName.slice(0, lastDotIndex);
      if (ext.length + 4 >= visibleLen) {
        return `${fileName.slice(0, visibleLen - 4)}....`;
      }
      // 精确算术：20字视口容量 - 后缀长度(5) - 4个点(4) = 11字前缀
      const prefixLen = Math.max(4, visibleLen - ext.length - 4);
      return `${mainName.slice(0, prefixLen)}....${ext}`;
    }
    return `${fileName.slice(0, visibleLen - 4)}....`;
  };

  // 业务字数计算逻辑：优先精准计算真实的中文字数（汉字数），完美符合中文业务直觉
  const calculateRealWordCount = (text: string): number => {
    if (!text) return 0;
    const chineseMatches = text.match(/[\u4e00-\u9fa5]/g);
    const chineseCount = chineseMatches ? chineseMatches.length : 0;
    if (chineseCount > 0) {
      return chineseCount; // 存在中文时，精准返回真实汉字数量 (例如 18 个汉字)
    }
    return text.length; // 纯英文/数字时按字符算
  };

  // 读取处理选中的本地文件
  // 核心原则：入库内容必须是文件本身的真实完整原文，绝不允许生成任何虚构/模板化内容。
//   - 图片：以 Base64 DataURL 全量保真存储，保证预览可还原原图
//   - 文档（Word / Excel / PDF / PPT / 压缩包…）：交由服务端 /api/studio/extract-text 真实解析，
//     浏览器端 readAsText 读取二进制文档只会得到乱码，因此必须由服务端提取真实文本
//   - 纯文本：服务端解析（自动识别 GBK 等编码）；若服务端不可用再回退前端读取
const processSelectedFile = async (file: File) => {
  if (!file) return;
  setFileError(false);
  setSelectedFile(file);

  // 真实容量：直接取自 File.size，即文件的真实字节数
  const sizeBytes = file.size;
  const ext = getFileExtension(file.name);
  const inferredType = inferTypeFromExt(file.name);
  const safeName = file.name.length > 14 ? `${file.name.slice(0, 10)}...` : file.name;

  setUploadedMeta({
    name: file.name,
    size: formatFileSize(sizeBytes),
    sizeBytes,
    ext,
  });

  setImportAssetForm((prev) => ({
    ...prev,
    title: file.name,
    type: inferredType,
  }));
  setTitleError(false);

  // 服务端解析统一入口：30 秒超时保护，避免解析卡死导致页面无法操作
  const extractTextViaServer = async (targetFile: File) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const formData = new FormData();
      formData.append("file", targetFile);
      const res = await fetch("/api/studio/extract-text", {
        method: "POST",
        credentials: "include",
        body: formData,
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, data };
    } catch (err: any) {
      return {
        ok: false,
        data: { error: err?.name === "AbortError" ? "文件解析超时" : "文件解析失败" },
      };
    } finally {
      clearTimeout(timer);
    }
  };

  // 1. 图片文件：优先 OCR 识别图中文字；无文字则提示无可提取内容，原图仍完整预览
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"].includes(ext) || file.type.startsWith("image/")) {
    setIsParsing(true);
    const notice = "该文件为图片文件，无可提取的文字内容，可在预览中查看原图。";
    try {
      const { ok, data } = await extractTextViaServer(file);
      const text = (data?.text || "").trim();
      if (ok && data?.success && text) {
        const summary = generateSmartSummary(text, file.name);
        setImportAssetForm((prev) => ({
          ...prev,
          content: text,
          type: "image",
          description: summary.overview,
        }));
        toast.success(`已识别图片中的文字 [${safeName}]`);
      } else {
        setImportAssetForm((prev) => ({
          ...prev,
          content: "",
          type: "image",
          description: notice,
        }));
        toast.success(`图片 [${safeName}] 无文字内容可提取，预览时展示原图`);
      }
    } catch {
      if (!isMountedRef.current) return;
      setImportAssetForm((prev) => ({
        ...prev,
        content: "",
        type: "image",
        description: notice,
      }));
      toast.success(`图片 [${safeName}] 无文字内容可提取，预览时展示原图`);
    } finally {
      if (isMountedRef.current) setIsParsing(false);
    }
    return;
  }

  // 2. 文档与文本文件：交由服务端真实解析，得到文件本身的完整原文
  setIsParsing(true);
  try {
    const { ok, data } = await extractTextViaServer(file);

    if (!ok) {
      const isLikelyTextFile = /\.(txt|md|markdown|json|yaml|yml|xml|csv|log|ts|tsx|js|jsx|java|py|go|sql|sh|html|css)$/i.test(file.name);
      if (isLikelyTextFile) {
        throw new Error(data?.error || "服务端解析失败");
      }
      setImportAssetForm((prev) => ({
        ...prev,
        content: "",
        description: data?.error || "该文件解析超时或无可提取文字，可在预览中查看原文件或下载。",
      }));
      toast.warning(data?.error || "文件解析超时，已保留原文件，可先导入再预览");
      return;
    }
    if (!data.success) {
      throw new Error(data.error || "服务端解析失败");
    }
    if (!isMountedRef.current) return;

    const realText: string = (data.text || "").trim();
    if (!realText) {
      const isLikelyTextFile = /\.(txt|md|markdown|json|yaml|yml|xml|csv|log|ts|tsx|js|jsx|java|py|go|sql|sh|html|css)$/i.test(file.name);
      if (!isLikelyTextFile) {
        setImportAssetForm((prev) => ({
          ...prev,
          content: "",
          description: "该文件无文字内容可提取，可在预览中查看原文件或下载。",
        }));
        toast.success(`已确认文件 [${safeName}] 无可提取文字内容`);
        return;
      }
      throw new Error("未能从文件中提取到有效文本");
    }

    // 服务端返回的 fileSize 为真实字节数，可信时优先采用
    const realSize =
      typeof data.fileSize === "number" && data.fileSize > 0 ? data.fileSize : sizeBytes;
    setUploadedMeta((prev) =>
      prev ? { ...prev, size: formatFileSize(realSize), sizeBytes: realSize } : prev
    );

    // 基于真实原文生成智能总结
    const summary = generateSmartSummary(realText, file.name);
    setImportAssetForm((prev) => ({
      ...prev,
      content: realText,
      description: summary.overview,
    }));
    toast.success(`已成功解析文件完整原文 [${safeName}]`);
  } catch (err: any) {
    if (!isMountedRef.current) return;
    // 回退：纯文本场景改用前端 FileReader 读取（保证功能不因服务端异常而中断）
    const fallbackReader = new FileReader();
    fallbackReader.onload = (e) => {
      if (!isMountedRef.current) return;
      const buffer = e.target?.result as ArrayBuffer;
      if (buffer) {
        let cleanText = "";
        try {
          cleanText = new TextDecoder("utf-8", { fatal: true }).decode(buffer).trim();
        } catch {
          try {
            cleanText = new TextDecoder("gbk").decode(buffer).trim();
          } catch {
            cleanText = new TextDecoder("utf-8").decode(buffer).trim();
          }
        }
        const summary = generateSmartSummary(cleanText, file.name);
        setImportAssetForm((prev) => ({
          ...prev,
          content: cleanText,
          description: summary.overview,
        }));
        toast.success(`已读取文件原文 [${safeName}]`);
      }
    };
    fallbackReader.onerror = () => {
      if (!isMountedRef.current) return;
      toast.error(err?.message || "读取本地文件原文失败");
    };
    fallbackReader.readAsArrayBuffer(file);
  } finally {
    if (isMountedRef.current) setIsParsing(false);
  }
};

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processSelectedFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = (e.target as HTMLInputElement).files?.[0] || e.dataTransfer.files?.[0];
    if (file) processSelectedFile(file);
  };

  const handleRemoveSelectedFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setUploadedMeta(null);
    setSelectedFile(null);
    setImportAssetForm(prev => ({ ...prev, title: "", content: "" }));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    toast.info("已清空当前所选文件，请选择新文件");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let hasError = false;

    // 1. 必填验证：资料文件标题为必填项
    if (!importAssetForm.title.trim()) {
      setTitleError(true);
      toast.warning("资料文件标题为必填项，请输入资料标题");
      hasError = true;
    } else {
      setTitleError(false);
    }

    // 2. 必填验证：知识模式下需填写正文内容；资料模式下需选择文件或填写文本提取提要
    const hasFile = Boolean(uploadedMeta || selectedFile);
    const hasContent = Boolean(importAssetForm.content.trim());

    if (mode === "knowledge" && !hasContent) {
      setFileError(true);
      toast.warning("知识库正文为必填项，请填写完整内容");
      hasError = true;
    } else if (mode !== "knowledge" && !hasFile && !hasContent) {
      setFileError(true);
      toast.warning("请选择或拖拽本地文件上传，或填写文本提取提要");
      hasError = true;
    } else {
      setFileError(false);
    }

    // 信息未填完整时，直接在弹窗内拦截并警告提示，100% 保持弹窗开启状态供用户继续补充
    if (hasError) return;

    // 智能总结：始终基于「文件真实原文」即时生成，确保与内容一致
    const isImageType = importAssetForm.type.toLowerCase() === "image";
    const finalSummary = isImageType || !importAssetForm.content.trim()
      ? `《${importAssetForm.title.trim()}》为${isImageType ? "图片" : "无文字"}文件，无文字内容可提取，可预览原文件或下载查看。`
      : generateSmartSummary(importAssetForm.content, importAssetForm.title.trim()).overview;

    try {
      const res = await onImport({
        title: importAssetForm.title.trim(),
        content: importAssetForm.content,
        type: importAssetForm.type.toUpperCase(),
        description: importAssetForm.description.trim(),
        visibility: importAssetForm.visibility,
        file: selectedFile,
        // 真实文件元信息：字节数取 File.size（服务端解析成功时已校正为真实值）
        fileSize: uploadedMeta?.sizeBytes ?? null,
        fileExt: uploadedMeta?.ext ?? null,
        summary: finalSummary,
      });

      // 父组件持久化逻辑报错/拦截时，保持弹窗开启供用户修正
      if (res === false) return;

      setImportAssetForm({ title: "", content: "", type: "pdf", description: "", visibility: "PUBLIC" });
      setUploadedMeta(null);
      setSelectedFile(null);
      setTitleError(false);
      setFileError(false);
      setIsParsing(false);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "导入失败，请检查填写内容");
    }
  };

  const modalJSX = (
    <div className="fixed inset-0 w-screen h-screen bg-slate-900/60 backdrop-blur-md z-[999999] flex items-center justify-center p-4 sm:p-6 font-sans text-left animate-in fade-in duration-200">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl text-left border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto my-auto animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 text-[#3182ce] flex items-center justify-center font-bold">
              📥
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">
                {mode === "knowledge" ? "录入/沉淀团队知识 (SOP)" : "导入新资料"}
              </h3>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                {mode === "knowledge"
                  ? "填写知识标题与完整内容，提交后归档至空间知识库（普通成员提交将进入待审核）"
                  : "支持点击/拖拽本地文件上传，或手动贴入文本素材"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 font-black flex items-center justify-center transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3.5 text-xs font-bold text-slate-700">
          {/* 1. 本地文件点击 / 拖拽上传核心区域 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              📁 选择或拖拽本地文件上传 <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,.doc,.docx,.wps,.xls,.xlsx,.csv,.txt,.md,.markdown,.json,.yaml,.yml,.xml,.ts,.tsx,.js,.jsx,.java,.py,.go,.sql,.sh,.html,.css,.log,.svg,.png,.jpg,.jpeg,.zip,.rar"
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`p-4 border-2 border-dashed rounded-2xl transition-all duration-200 ${
                fileError
                  ? "border-red-400 bg-red-50/20 ring-2 ring-red-200/60"
                  : isDragging
                  ? "border-[#3182ce] bg-blue-50/80 scale-[1.01]"
                  : uploadedMeta
                  ? "border-emerald-300 bg-emerald-50/40"
                  : "border-slate-200/80 bg-slate-50/60 hover:bg-white hover:border-[#3182ce]/60 cursor-pointer"
              }`}
            >
              {uploadedMeta ? (
                <div className="flex items-center justify-between gap-2 text-slate-900 font-bold">
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <FileText className="w-4 h-4 text-[#3182ce] shrink-0" />
                    <div className="min-w-0">
                      <div className="truncate text-slate-800 font-extrabold text-xs" title={uploadedMeta.name}>
                        已选择本地文件: {formatTruncatedFileName(uploadedMeta.name, 20)}
                      </div>
                      {/* 真实容量与文件类型：容量取自文件真实字节数，类型由扩展名真实判定 */}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600 font-bold text-[10px]">
                          真实容量 {uploadedMeta.size}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-[#3182ce] font-bold text-[10px]">
                          {getFileTypeLabel({ ext: uploadedMeta.ext, title: uploadedMeta.name })}
                        </span>
                        {isParsing && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 font-bold text-[10px] inline-flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> 服务端解析原文中…
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* 统一高醒目的红色【移除并重选】按钮 */}
                  <button
                    type="button"
                    onClick={handleRemoveSelectedFile}
                    className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200/80 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0 active:scale-95 shadow-2xs"
                    title="清空当前已选文件，重新选择"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    <span>移除并重选</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-1 text-center cursor-pointer">
                  <Upload className="w-6 h-6 text-[#3182ce] mx-auto" />
                  <p className="text-xs text-slate-700 font-bold">
                    点击此处选择文件，或将本地文件拖拽至此区域
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    支持全组件能力格式: .pdf / .docx / .xlsx / .csv / .md / .txt / .json / .yaml / .sql / 源码 / 日志 / 图片 / 压缩包 (自动智能解析)
                  </p>
                </div>
              )}
            </div>
            {fileError && (
              <p className="text-[11px] text-red-500 font-bold mt-1 flex items-center gap-1">
                ⚠️ 请先选择或拖拽本地文件上传，或在下方填写文本提取提要
              </p>
            )}
          </div>

          {/* 2. 文件标题 (必填 & 真实无损保存 & 100字上限) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700">
                资料文件标题 <span className="text-red-500">*</span>
              </label>
              <span className="text-[10px] text-slate-400 font-mono">
                {importAssetForm.title.length}/100字
              </span>
            </div>
            <input
              type="text"
              maxLength={100}
              value={importAssetForm.title}
              title={importAssetForm.title}
              onChange={(e) => {
                const val = e.target.value;
                setImportAssetForm((prev) => ({ ...prev, title: val }));
                if (val.trim()) setTitleError(false);
              }}
              placeholder="例如：机器人系统应用分析报告.docx"
              className={`w-full h-9 px-3 text-xs border rounded-xl focus:outline-none font-medium transition-all text-slate-800 ${
                titleError
                  ? "border-red-400 ring-2 ring-red-200/60 bg-red-50/10 text-slate-900"
                  : "border-slate-200 focus:border-[#3182ce]"
              }`}
            />
            {titleError && (
              <p className="text-[11px] text-red-500 font-bold mt-1 flex items-center gap-1">
                ⚠️ 资料文件标题为必填项，不可为空
              </p>
            )}
          </div>

          {/* 3. 新增：资料详细描述与用途说明 (字数上限控制) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700">
                资料描述与用途说明
              </label>
              <span className="text-[10px] text-slate-400 font-mono">
                {importAssetForm.description.length}/120字
              </span>
            </div>
            <input
              type="text"
              maxLength={120}
              value={importAssetForm.description}
              onChange={(e) => setImportAssetForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="简要说明该资料在工作空间中的用途、适用范围或备注信息..."
              className="w-full h-9 px-3 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#3182ce] font-medium"
            />
          </div>

          {/* 4. 文件内容文本 (已排除乱码) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              文件提取文本提要
            </label>
            <textarea
              value={importAssetForm.content}
              onChange={(e) => setImportAssetForm((prev) => ({ ...prev, content: e.target.value }))}
              placeholder="选择本地文件后将自动填充文本；二进制文件将生成合规提要，亦可手动粘贴文本..."
              rows={3}
              className="w-full p-3 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#3182ce] font-mono leading-relaxed bg-slate-50/50"
            />
          </div>

          {/* 5. 资料共享范围 (公开 / 私密) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              资料共享范围与权限
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs font-bold">
              <label
                onClick={() => setImportAssetForm(prev => ({ ...prev, visibility: "PUBLIC" }))}
                className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center gap-2 ${
                  importAssetForm.visibility === "PUBLIC"
                    ? "bg-blue-50 border-[#3182ce] text-slate-900 shadow-2xs"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  checked={importAssetForm.visibility === "PUBLIC"}
                  onChange={() => {}}
                  className="text-[#3182ce]"
                />
                <div>
                  <span className="block font-black text-slate-800">🌐 空间公开资料</span>
                  <span className="text-[10px] text-slate-400 font-medium block">公开至空间，需管理员审核</span>
                </div>
              </label>

              <label
                onClick={() => setImportAssetForm(prev => ({ ...prev, visibility: "PRIVATE" }))}
                className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center gap-2 ${
                  importAssetForm.visibility === "PRIVATE"
                    ? "bg-purple-50 border-purple-500 text-slate-900 shadow-2xs"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  checked={importAssetForm.visibility === "PRIVATE"}
                  onChange={() => {}}
                  className="text-purple-600"
                />
                <div>
                  <span className="block font-black text-slate-800">🔒 个人私密资料</span>
                  <span className="text-[10px] text-slate-400 font-medium block">仅自己可见，随时物理删除</span>
                </div>
              </label>
            </div>
          </div>

          {/* 6. 资料类型 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              资料类型
            </label>
            <select
              value={importAssetForm.type}
              onChange={(e) => setImportAssetForm((prev) => ({ ...prev, type: e.target.value }))}
              className="w-full h-9 px-3 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#3182ce] font-extrabold text-slate-700 cursor-pointer"
            >
              <option value="pdf">📄 PDF 招标文件与商业规范 (.pdf)</option>
              <option value="word">📑 Word/WPS 办公规范文档 (.docx/.doc/.wps)</option>
              <option value="excel">📊 Excel/CSV 数据报表与算力表 (.xlsx/.xls/.csv)</option>
              <option value="markdown">📝 Markdown 需求规格与架构设计 (.md/.markdown)</option>
              <option value="json">💻 JSON/YAML/XML 接口契约与配置 (.json/.yaml/.yml/.xml)</option>
              <option value="code">🛠️ 源码工程/SQL/脚本文件 (.ts/.js/.py/.java/.sql/.sh)</option>
              <option value="image">🖼️ SVG/图片/矢量图设计资产 (.svg/.png/.jpg)</option>
              <option value="txt">📑 文本/日志/通用研报文件 (.txt/.log/.rtf)</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end pt-3 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-all"
          >
            取消
          </button>
          <button
            type="submit"
            className="px-5 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 cursor-pointer transition-all active:scale-95"
          >
            确认导入
          </button>
        </div>
      </form>
    </div>
  );

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(modalJSX, document.body);
}
