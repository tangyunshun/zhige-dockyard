-- CreateTable
CREATE TABLE `system_document_history` (
    `id` VARCHAR(191) NOT NULL,
    `document_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NULL,
    `category` VARCHAR(191) NOT NULL,
    `tags` VARCHAR(191) NULL,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `editor_id` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SystemDocumentHistory_documentId_idx`(`document_id`),
    INDEX `SystemDocumentHistory_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `SystemDocument_title_category_key` ON `systemdocument`(`title`, `category`);

-- AddForeignKey
ALTER TABLE `system_document_history` ADD CONSTRAINT `SystemDocumentHistory_documentId_fkey` FOREIGN KEY (`document_id`) REFERENCES `systemdocument`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `system_document_history` ADD CONSTRAINT `SystemDocumentHistory_editorId_fkey` FOREIGN KEY (`editor_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
