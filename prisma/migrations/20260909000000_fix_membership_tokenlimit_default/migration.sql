-- AlterTable: 修正 membershiplevel.tokenLimit 字段默认值，与 seed（免费版 = 100）对齐，
-- 消除历史"10000"默认值误导（早期"按会员等级白送初始算力"口径残留）。
-- 仅约束未来未显式指定 tokenLimit 的写入；不影响已 seed 的现有会员等级数据。
ALTER TABLE `membershiplevel` ALTER COLUMN `tokenLimit` SET DEFAULT 100;
