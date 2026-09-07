/** 展示层本地化：枚举→中文、ISO→本地友好时间。仅用于渲染，绝不改动存储值；未知值原样返回。 */
const map = (table: Record<string, string>) => (value: string): string => table[value] ?? value;

export const formatJobType = map({ graduate: "应届", internship: "实习", tech: "技术", general: "通用", other: "其他" });
export const formatWorkMode = map({ onsite: "现场", remote: "远程", hybrid: "混合", unknown: "未知" });
export const formatInterviewType = map({ phone: "电话", video: "视频", onsite: "现场", assessment: "测评", other: "其他" });
export const formatInterviewStatus = map({ scheduled: "已安排", completed: "已完成", cancelled: "已取消", rescheduled: "已改期" });
export const formatResumeStatus = map({ ready: "就绪", "needs-review": "待确认", "extraction-failed": "提取失败", deleted: "已删除" });
export const formatTimelineEventType = map({ "stage-changed": "阶段变更", "resume-changed": "简历切换", "note-added": "新增备注", archived: "已归档", "interview-rescheduled": "面试改期" });

export function formatDateTime(iso: string, timezone?: string): string {
  if (!iso) return iso;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, ...(timezone ? { timeZone: timezone } : {}) }).format(date);
  } catch {
    return date.toLocaleString();
  }
}
