# -*- coding: utf-8 -*-
# ComponentBrowser：搜索历史改为 Enter 才写入（防止每次按键污染历史）+ 搜索防抖提示
import io

P = "src/components/studio/ComponentBrowser.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. handleSearch：只更新 query，不写历史（历史改为 Enter 提交时写入）
old = """  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim() && !searchHistory.includes(query.trim())) {
      const newHistory = [query.trim(), ...searchHistory].slice(0, 10);
      setSearchHistory(newHistory);
      saveSearchHistory(newHistory);
    }
  };"""
new = """  // KN-UI：搜索历史改为 Enter 提交时写入，防止每键污染历史（自查清单指令五）
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const commitSearchToHistory = () => {
    const trimmed = searchQuery.trim();
    if (trimmed && !searchHistory.includes(trimmed)) {
      const newHistory = [trimmed, ...searchHistory].slice(0, 10);
      setSearchHistory(newHistory);
      saveSearchHistory(newHistory);
    }
  };"""
assert old in s, "handleSearch"
s = s.replace(old, new, 1)

# 2. 搜索框：Enter 时写入历史并关闭历史面板
old = """                    onKeyDown={(e) => {
                      if (e.key === "Enter") setShowSearchHistory(false);
                      if (e.key === "Escape") setShowSearchHistory(false);
                    }}"""
new = """                    onKeyDown={(e) => {
                      if (e.key === "Enter") { commitSearchToHistory(); setShowSearchHistory(false); }
                      if (e.key === "Escape") setShowSearchHistory(false);
                    }}"""
assert old in s, "keyDown"
s = s.replace(old, new, 1)

# 3. blur 时也提交历史（用户可能不按 Enter 而是点击外部）
old = """                    onFocus={() => setShowSearchHistory(true)}"""
new = """                    onFocus={() => setShowSearchHistory(true)}
                    onBlur={() => { commitSearchToHistory(); }}"""
assert old in s, "onBlur"
s = s.replace(old, new, 1)

# 4. PREMIUM 徽标中文化
for old_b in ['PREMIUM']:
    s = s.replace(f'>{old_b}<', '>旗舰<', 1)
    s = s.replace(f'"{old_b}"', '"旗舰"', 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("search history + premium OK")
