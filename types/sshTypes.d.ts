export interface SshExecutorOptions {
  /** 目标 SSH 节点配置标签 (对应配置中 ssh.<label>，缺省默认 'storage') */
  label?: string;
  /** 命令标准输出与错误输出的实时流式回调函数 */
  onData?: (data: string) => void;
  /** 是否使用代理网络 (专用于 downloadFileToMinio 等场景) */
  useProxy?: boolean;
}

export interface ExtractSubtitleItem {
  /** 导出的字幕文件名 (格式如 `track0.zh.Default.ass`) */
  file: string;
}

export interface ExtractFontItem {
  /** 导出的字体文件名 (如 `SourceHanSans.ttf`) */
  file: string;
  /** 字体家族族名 */
  family: string | null;
  /** 字体字重样式 (如 `Regular`, `Bold`) */
  style: string | null;
  /** 字体全称 */
  fullName: string | null;
  /** PostScript 字体标识名 */
  postScriptName: string | null;
}

export interface SshExtractResult<T> {
  /** 提取解析出的数据列表 */
  result: T[];
  /** 命令执行退出码 (>= 100 表示成功提取个数，1 为失败，-2 为执行器未就绪) */
  code: number;
}

export interface SshScriptImporter {
  value: string;
}

export interface SshScriptDefinition {
  /** 任务标题名称 */
  title: string;
  /** 任务描述动态生成函数 */
  descGenerator: (...args: any[]) => string;
  /** 脚本文件名标签 (缺省则以常量 Key 为准) */
  label?: string;
  /** 导入加载后的 Shell 脚本正文字符串 */
  script?: SshScriptImporter;
}

export interface SSHExecutorExecOptions {
  /** 任务标题 */
  title?: string;
  /** 任务详细描述 */
  desc?: string;
  /** 实时标准输出回调函数 */
  onData?: (data: string) => void;
}

export interface SSHExecutorExecResult {
  /** 命令退出码 */
  code: number;
  /** 标准输出内容 */
  stdout: string;
  /** 错误输出内容 */
  stderr: string;
}

export interface ISSHExecutor {
  /** 确保 SSH 连接已建立（未连接时自动连接） */
  ensureConnection(): Promise<void>;
  /** 串行提交并执行远程命令/脚本 */
  exec(scriptPath: string, args?: (string | number)[], options?: SSHExecutorExecOptions): Promise<SSHExecutorExecResult>;
  /** 主动断开 SSH 连接并清理定时器 */
  disconnect(): Promise<void>;
  /** 获取当前执行器运行快照与排队信息 */
  getCurrentTaskSnapshot(): {
    ready: boolean;
    pendingCount: number;
    taskSnapshot: object | null;
    tasksDesc: Array<{ title: string; desc: string }>;
  };
}
