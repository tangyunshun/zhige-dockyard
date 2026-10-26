-- 订单生命周期：待支付订单增加支付截止时间；超时未付置 EXPIRED，拒绝一切迟到入账
ALTER TABLE `billingrecord` ADD COLUMN `expiresAt` DATETIME NULL;
