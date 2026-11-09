# -*- coding: utf-8 -*-
# useWorkspaceHubData：加载失败 error 状态暴露（自查清单指令二）
import io

P = "src/hooks/useWorkspaceHubData.ts"
s = io.open(P, encoding="utf-8").read()

# 1. state：loadError
old = """    } catch (error) {
      console.error("加载聚合数据失败:", error);
    } finally {
      setIsLoading(false);"""
new = """    } catch (error) {
      setLoadError("工作台数据加载失败，请检查网络后重试");
    } finally {
      setIsLoading(false);"""
assert old in s, "catch"
s = s.replace(old, new, 1)

# 2. state 声明（在 isLoading 旁）
import re
m = re.search(r"\n(\s*)const \[isLoading, setIsLoading\] = useState[^\n]*;", s)
assert m, "isLoading state"
ins = m.end()
s = s[:ins] + "\n" + m.group(1) + "const [loadError, setLoadError] = useState<string | null>(null);" + s[ins:]

# 3. 成功清空：找 setPersonalWorkspaceDeleted(false) 后
old2 = """      } else {
        setPersonalWorkspace(null);
      }
      setEnterpriseWorkspace(enterprise || null);
    }"""
new2 = """      } else {
        setPersonalWorkspace(null);
      }
      setEnterpriseWorkspace(enterprise || null);
      setLoadError(null);
    }"""
assert old2 in s, "success clear"
s = s.replace(old2, new2, 1)

# 4. return 加 loadError
old3 = """    isLoading,
    needsPersonalWorkspace,"""
new3 = """    isLoading,
    loadError,
    needsPersonalWorkspace,"""
assert old3 in s, "return"
s = s.replace(old3, new3, 1)

# 5. console.log 残留清理（保留 console.error/warn 在 catch 中的合法日志——去掉纯调试 log）
s = s.replace('console.log("[useWorkspaceHubData] 用户认证失效:", errorData);', 'console.warn("[useWorkspaceHubData] 用户认证失效");', 1)
s = s.replace('console.log("[useWorkspaceHubData] 捕获全网组件装配变更事件…", detail);', '', 1)
import re as _re
s = _re.sub(r'console\.log\("\[useWorkspaceHubData\][^"]*",[^;]*\);\n?', '', s)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("hook OK")
