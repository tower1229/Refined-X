import { getCollection } from 'astro:content';
import { getPublicProfile } from '../lib/public-data';

export async function GET() {
	const [profile, [resume]] = await Promise.all([getPublicProfile(), getCollection('resume')]);
	if (!resume) throw new Error('about.md 缺少 resume 内容');
	const body = `# ${resume.data.title}\n\n${profile.description ?? ''}\n\n## 联系与链接\n\n- 网站：${profile.url}\n${profile.sameAs.map((url) => `- ${url}`).join('\n')}\n${profile.email ? `- 邮箱：${profile.email}` : ''}\n${profile.wechat ? `- 微信：${profile.wechat}` : ''}\n\n## 简历\n\n${resume.body ?? ''}\n`;
	return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
}
