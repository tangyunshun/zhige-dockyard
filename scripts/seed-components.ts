/**
 * 种子脚本：插入 53 个组件和 10 个阶段数据到数据库
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 10 大阶段数据
const stages = [
  { id: 'stage-01', name: '商机与售前打单', code: 'BID_PREP', range: 'C01-C06', order: 1 },
  { id: 'stage-02', name: '需求定义与设计', code: 'REQ_DESIGN', range: 'C07-C10', order: 2 },
  { id: 'stage-03', name: '后端核心与 API', code: 'BACKEND_CORE', range: 'C11-C16', order: 3 },
  { id: 'stage-04', name: '数据库工程', code: 'DATABASE_ENG', range: 'C17-C20', order: 4 },
  { id: 'stage-05', name: '前端开发', code: 'FRONTEND_DEV', range: 'C21-C25', order: 5 },
  { id: 'stage-06', name: '测试与质量保证', code: 'TEST_QA', range: 'C26-C30', order: 6 },
  { id: 'stage-07', name: '运维与部署', code: 'DEVOPS', range: 'C31-C35', order: 7 },
  { id: 'stage-08', name: '安全与合规', code: 'SECURITY', range: 'C36-C40', order: 8 },
  { id: 'stage-09', name: '项目管理', code: 'PROJ_MGMT', range: 'C41-C45', order: 9 },
  { id: 'stage-10', name: '知识资产', code: 'KNOWLEDGE', range: 'C46-C53', order: 10 },
];

// 53 个组件数据
const components = [
  // C01-C06: 商机与售前打单
  { id: 'C01', name: 'RFP 标书解析', description: '自动解析招标文件结构与关键条款', stageCode: 'BID_PREP' },
  { id: 'C02', name: '资质偏离分析', description: '识别资质差距并生成整改建议', stageCode: 'BID_PREP' },
  { id: 'C03', name: '竞争对手画像', description: '基于历史数据构建竞争对手分析模型', stageCode: 'BID_PREP' },
  { id: 'C04', name: '成本估算模型', description: '根据项目规模与技术栈自动估算成本', stageCode: 'BID_PREP' },
  { id: 'C05', name: '技术方案生成', description: '基于标书要求自动生成技术方案框架', stageCode: 'BID_PREP' },
  { id: 'C06', name: '述标 PPT 制作', description: '自动生成述标演示文稿与演讲稿', stageCode: 'BID_PREP' },

  // C07-C10: 需求定义与设计
  { id: 'C07', name: '需求结构化整理', description: '将混沌需求转化为结构化 PRD', stageCode: 'REQ_DESIGN' },
  { id: 'C08', name: '用户故事地图', description: '基于需求自动生成用户故事与验收标准', stageCode: 'REQ_DESIGN' },
  { id: 'C09', name: '领域模型设计', description: '识别业务领域边界与核心实体', stageCode: 'REQ_DESIGN' },
  { id: 'C10', name: '系统架构设计', description: '生成系统架构图与技术选型建议', stageCode: 'REQ_DESIGN' },

  // C11-C16: 后端核心与 API
  { id: 'C11', name: 'RESTful API 生成', description: '基于数据模型自动生成 API 接口代码', stageCode: 'BACKEND_CORE' },
  { id: 'C12', name: 'GraphQL Schema 设计', description: '设计 GraphQL Schema 与 Resolver', stageCode: 'BACKEND_CORE' },
  { id: 'C13', name: '微服务边界划分', description: '基于业务关联度推荐服务拆分方案', stageCode: 'BACKEND_CORE' },
  { id: 'C14', name: '消息队列集成', description: '集成 Kafka/RabbitMQ 等消息中间件', stageCode: 'BACKEND_CORE' },
  { id: 'C15', name: '缓存策略设计', description: '设计 Redis 缓存策略与失效机制', stageCode: 'BACKEND_CORE' },
  { id: 'C16', name: '认证授权实现', description: '实现 JWT/OAuth2 等认证授权机制', stageCode: 'BACKEND_CORE' },

  // C17-C20: 数据库工程
  { id: 'C17', name: '慢 SQL 优化', description: '分析执行计划并提供索引优化建议', stageCode: 'DATABASE_ENG' },
  { id: 'C18', name: '数据库逆向工程', description: '扫描老旧数据库自动生成 ER 图与数据字典', stageCode: 'DATABASE_ENG' },
  { id: 'C19', name: '数据迁移脚本', description: '生成跨数据库类型的数据清洗与迁移脚本', stageCode: 'DATABASE_ENG' },
  { id: 'C20', name: '国产数据库适配', description: '将 Oracle 等传统 SQL 转换为达梦/人大金仓语法', stageCode: 'DATABASE_ENG' },

  // C21-C25: 前端开发
  { id: 'C21', name: 'React 组件生成', description: '基于设计稿或描述生成 React 组件代码', stageCode: 'FRONTEND_DEV' },
  { id: 'C22', name: 'Vue 组件生成', description: '基于设计稿或描述生成 Vue 组件代码', stageCode: 'FRONTEND_DEV' },
  { id: 'C23', name: '响应式布局优化', description: '自动适配 PC/平板/手机多端布局', stageCode: 'FRONTEND_DEV' },
  { id: 'C24', name: '表单验证生成', description: '基于业务规则生成前端表单验证逻辑', stageCode: 'FRONTEND_DEV' },
  { id: 'C25', name: '图表可视化', description: '基于数据自动生成 ECharts/D3 图表', stageCode: 'FRONTEND_DEV' },

  // C26-C30: 测试与质量保证
  { id: 'C26', name: '单元测试生成', description: '基于业务代码自动生成 Jest/Vitest 测试用例', stageCode: 'TEST_QA' },
  { id: 'C27', name: '接口测试脚本', description: '生成 Postman/ApiFox 接口测试脚本', stageCode: 'TEST_QA' },
  { id: 'C28', name: '性能压测方案', description: '设计 JMeter/k6 性能压测场景与指标', stageCode: 'TEST_QA' },
  { id: 'C29', name: '代码质量扫描', description: '集成 SonarQube 进行代码质量分析', stageCode: 'TEST_QA' },
  { id: 'C30', name: '自动化测试脚本', description: '生成 Selenium/Cypress UI 自动化测试脚本', stageCode: 'TEST_QA' },

  // C31-C35: 运维与部署
  { id: 'C31', name: 'Docker 镜像构建', description: '生成 Dockerfile 并优化镜像体积', stageCode: 'DEVOPS' },
  { id: 'C32', name: 'K8s 部署配置', description: '生成 Kubernetes 部署 YAML 与 Helm Chart', stageCode: 'DEVOPS' },
  { id: 'C33', name: 'CI/CD 流水线', description: '配置 GitHub Actions/GitLab CI 流水线', stageCode: 'DEVOPS' },
  { id: 'C34', name: '监控告警配置', description: '集成 Prometheus+Grafana 监控告警体系', stageCode: 'DEVOPS' },
  { id: 'C35', name: '日志收集分析', description: '搭建 ELK/Loki 日志收集与分析平台', stageCode: 'DEVOPS' },

  // C36-C40: 安全与合规
  { id: 'C36', name: 'SQL 注入检测', description: '扫描代码中的 SQL 注入风险', stageCode: 'SECURITY' },
  { id: 'C37', name: 'XSS 漏洞扫描', description: '检测前端 XSS 跨站脚本攻击风险', stageCode: 'SECURITY' },
  { id: 'C38', name: '依赖漏洞扫描', description: '扫描 npm/maven 依赖的安全漏洞', stageCode: 'SECURITY' },
  { id: 'C39', name: '等保合规检查', description: '自动检查等保 2.0 合规项', stageCode: 'SECURITY' },
  { id: 'C40', name: '数据脱敏处理', description: '对敏感数据进行脱敏与加密存储', stageCode: 'SECURITY' },

  // C41-C45: 项目管理
  { id: 'C41', name: 'WBS 任务分解', description: '基于项目范围自动生成 WBS 工作分解结构', stageCode: 'PROJ_MGMT' },
  { id: 'C42', name: '甘特图生成', description: '基于任务依赖关系自动生成项目甘特图', stageCode: 'PROJ_MGMT' },
  { id: 'C43', name: '风险评估矩阵', description: '识别项目风险并生成应对策略', stageCode: 'PROJ_MGMT' },
  { id: 'C44', name: '迭代计划排期', description: '基于团队速率自动排期迭代计划', stageCode: 'PROJ_MGMT' },
  { id: 'C45', name: '项目复盘报告', description: '自动生成项目复盘报告与改进建议', stageCode: 'PROJ_MGMT' },

  // C46-C53: 知识资产
  { id: 'C46', name: '技术文档生成', description: '基于代码自动生成 API 文档与使用手册', stageCode: 'KNOWLEDGE' },
  { id: 'C47', name: '架构图自动绘制', description: '基于代码依赖关系自动生成架构图', stageCode: 'KNOWLEDGE' },
  { id: 'C48', name: '知识库问答', description: '基于企业知识库的智能问答系统', stageCode: 'KNOWLEDGE' },
  { id: 'C49', name: '最佳实践库', description: '积累并推荐项目最佳实践案例', stageCode: 'KNOWLEDGE' },
  { id: 'C50', name: '技术雷达', description: '跟踪并评估新技术的适用性', stageCode: 'KNOWLEDGE' },
  { id: 'C51', name: '代码规范检查', description: '基于团队规范的代码风格检查', stageCode: 'KNOWLEDGE' },
  { id: 'C52', name: '专利交底书', description: '基于技术创新点生成专利交底书', stageCode: 'KNOWLEDGE' },
  { id: 'C53', name: '技术分享 PPT', description: '基于项目经验生成技术分享演示文稿', stageCode: 'KNOWLEDGE' },
];

// 会员等级数据
const membershipLevels = [
  { id: 'free', name: '免费用户', nameZh: '免费用户', maxEnterpriseWorkspaces: 1, priceMonthly: 0 },
  { id: 'basic', name: '基础会员', nameZh: '基础会员', maxEnterpriseWorkspaces: 3, priceMonthly: 99 },
  { id: 'pro', name: '专业会员', nameZh: '专业会员', maxEnterpriseWorkspaces: 5, priceMonthly: 199 },
  { id: 'enterprise', name: '企业会员', nameZh: '企业会员', maxEnterpriseWorkspaces: 10, priceMonthly: 499 },
];

async function main() {
  console.log('🌱 开始插入种子数据...');

  try {
    // 1. 插入组件数据
    console.log('\n🧩 插入组件数据...');
    for (const comp of components) {
      await prisma.componenttask.upsert({
        where: { id: comp.id },
        update: {},
        create: {
          id: comp.id,
          name: comp.name,
          description: comp.description,
          type: comp.id, // 使用组件 ID 作为 type
          status: 'COMPLETED',
          isPublished: true,
        },
      });
      console.log(`  ✅ ${comp.id}: ${comp.name}`);
    }

    // 2. 插入会员等级数据
    console.log('\n💎 插入会员等级数据...');
    for (const level of membershipLevels) {
      await prisma.membershiplevel.upsert({
        where: { id: level.id },
        update: {},
        create: {
          id: level.id,
          name: level.name,
          nameZh: level.nameZh,
          maxEnterpriseWorkspaces: BigInt(level.maxEnterpriseWorkspaces),
          priceMonthly: level.priceMonthly,
        },
      });
      console.log(`  ✅ ${level.name}: ${level.maxEnterpriseSlots} 个企业空间槽位`);
    }

    console.log('\n✅ 种子数据插入完成！');
  } catch (error) {
    console.error('❌ 种子数据插入失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
