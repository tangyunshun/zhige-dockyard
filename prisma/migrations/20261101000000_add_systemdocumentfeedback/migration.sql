-- CreateTable
CREATE TABLE `system_document_feedback` (
    `id` VARCHAR(191) NOT NULL,
    `document_id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `vote` VARCHAR(191) NOT NULL DEFAULT 'HELPFUL',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SystemDocumentFeedback_documentId_idx`(`document_id`),
    INDEX `SystemDocumentFeedback_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `SystemDocumentFeedback_documentId_userId_key` ON `system_document_feedback`(`document_id`, `userId`);
