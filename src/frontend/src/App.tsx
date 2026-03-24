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
    // Only auto-scroll to bottom when not paused
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
          // Only auto-scroll when not paused (already guarded by pausedRef check above)
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
  const [injectedLines, setInjectedLines] = useState<(TermLine | null)[]>(
    Array(6).fill(null),
  );

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
    }, 3000);
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
    const newLine: TermLine = {
      id: lineIdCounter++,
      text: msgInput.trim(),
      type: "custom",
    };
    // Inject into all panels
    setInjectedLines(Array(6).fill(newLine));
    setTimeout(() => setInjectedLines(Array(6).fill(null)), 100);
    setMsgInput("");
    setShowAddMsg(false);
  };

  const timeStr = time.toTimeString().slice(0, 8);
  const dateStr = time.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return (
    <div
      className="relative"
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
          }}
        >
          + ADD MSG
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
                width: "min(480px, 90vw)",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
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
                Yeh message sabhi panels mein bright color mein dikhega
              </div>
              <input
                type="text"
                value={msgInput}
                onChange={(e) => setMsgInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddMessage();
                  if (e.key === "Escape") setShowAddMsg(false);
                }}
                placeholder="Apna message likho..."
                data-ocid="add_msg.input"
                style={{
                  background: "oklch(0.04 0.008 145)",
                  border: "1px solid oklch(0.85 0.22 145 / 0.4)",
                  color: "oklch(0.85 0.22 145)",
                  fontSize: "0.75rem",
                  letterSpacing: "0.08em",
                  padding: "10px 12px",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowAddMsg(false)}
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
                  CANCEL
                </button>
                <button
                  type="button"
                  data-ocid="add_msg.submit_button"
                  onClick={handleAddMessage}
                  style={{
                    padding: "8px 20px",
                    border: "1px solid oklch(0.70 0.18 290 / 0.8)",
                    background: "oklch(0.70 0.18 290 / 0.1)",
                    color: "oklch(0.70 0.18 290)",
                    fontSize: "0.65rem",
                    letterSpacing: "0.15em",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    boxShadow: "0 0 10px oklch(0.70 0.18 290 / 0.3)",
                  }}
                >
                  INJECT
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
