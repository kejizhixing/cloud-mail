import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import kvObjService from './service/kv-obj-service';
import oauthService from "./service/oauth-service";
import analysisService from './service/analysis-service';

export default {
    async fetch(req, env, ctx) {
        const url = new URL(req.url);

        if (url.pathname.startsWith('/api/')) {
            url.pathname = url.pathname.replace('/api', '');
            req = new Request(url.toString(), req);
            return app.fetch(req, env, ctx);
        }

        if (['/static/', '/attachments/'].some(p => url.pathname.startsWith(p))) {
            return await kvObjService.toObjResp({ env }, url.pathname.substring(1));
        }

        return env.assets.fetch(req);
    },

    email: email,

    async scheduled(event, env, ctx) {
        const now = new Date();
        const hours = now.getUTCHours();
        const minutes = now.getUTCMinutes();

        // ============ cloud-mail 自己的任务 ============
        // 每 30 分钟执行：刷新图表缓存（原来 */30 的任务）
        await analysisService.refreshEchartsCache({ env });

        // 每天 UTC 16:00~16:29 执行一次全部清理任务（原来另一个 cron 的任务）
        if (hours === 16 && minutes < 30) {
            await verifyRecordService.clearRecord({ env });
            await userService.resetDaySendCount({ env });
            await emailService.completeReceiveAll({ env });
            await oauthService.clearNoBindOathUser({ env });
            // refreshEchartsCache 在上面已经调用过了，这里不用重复
        }

        // ============ 调用其他 Worker 的定时任务 ============
        // 请根据你其他 Worker 的原 cron 表达式添加以下调用

        // 示例：Worker-A 原来每小时整点执行（cron: 0 * * * *）
        if (minutes < 5) {
            await invokeWorker('worker-a', env.CRON_SECRET);
        }

        // 示例：Worker-B 原来每 10 分钟执行（cron: */10 * * * *）
        if (minutes % 10 < 5) {
            await invokeWorker('worker-b', env.CRON_SECRET);
        }

        // 如果有更多 Worker，照此添加 if 条件和 invokeWorker 调用
        // 注意：每个 Worker 名替换为你实际的 Worker 名称
    }
};

// 调用其他 Worker 的 /__cron 接口
async function invokeWorker(workerName, secret) {
    // 方式一：使用 workers.dev 默认域名（需替换为你的子域名）
    const url = `https://${workerName}.你的账户子域名.workers.dev/__cron`;
    
    // 方式二（推荐）：使用 Service Bindings 无需公网，以后可优化

    try {
        await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${secret}`,
                'Content-Type': 'application/json',
            },
        });
    } catch (e) {
        console.error(`调用 ${workerName} 失败: ${e.message}`);
    }
}
