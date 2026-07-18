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

        // 每30分钟必然执行的轻量任务（原来的 */30 逻辑）
        await analysisService.refreshEchartsCache({ env });

        // 原来在另一个 cron（可能是 0 16 * * *）执行的全部任务
        // 我们限定在 UTC 16:00 ～ 16:29 这个窗口执行（只执行一次，避免16:00和16:30重复触发）
        if (hours === 16 && minutes < 30) {
            // 确保每天只执行一次，可以用一个 KV 标记，但为简单起见，通过时间窗口限制
            await verifyRecordService.clearRecord({ env });
            await userService.resetDaySendCount({ env });
            await emailService.completeReceiveAll({ env });
            await oauthService.clearNoBindOathUser({ env });
            // 注意：refreshEchartsCache 上面已经执行过了，这里不用再调用
        }
    },
};
