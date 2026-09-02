-- AlterTable
ALTER TABLE `document`
  ADD COLUMN `file_path` VARCHAR(191) NULL,
  ADD COLUMN `mime_type` VARCHAR(128) NULL,
  ADD COLUMN `original_name` VARCHAR(255) NULL;
