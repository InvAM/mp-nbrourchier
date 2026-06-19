const webLogsEnabled = process.env.NEXT_PUBLIC_WEB_LOGS !== "false";

function write(level, scope, message, data) {
  if (!webLogsEnabled) return;
  const prefix = `[web:${scope}]`;
  if (data === undefined) {
    console[level](`${prefix} ${message}`);
    return;
  }
  console[level](`${prefix} ${message}`, data);
}

export const webLog = {
  info(scope, message, data) {
    write("log", scope, message, data);
  },
  warn(scope, message, data) {
    write("warn", scope, message, data);
  },
  error(scope, message, data) {
    write("error", scope, message, data);
  },
};

export function maskEmail(email) {
  if (!email || typeof email !== "string") return "";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  if (!local) return `***@${domain}`;
  const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${visible}***@${domain}`;
}

export function shortValue(value, edge = 6) {
  if (!value || typeof value !== "string") return "";
  if (value.length <= edge * 2) return `${value.slice(0, 1)}***`;
  return `${value.slice(0, edge)}...${value.slice(-edge)}`;
}
