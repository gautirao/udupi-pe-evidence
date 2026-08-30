import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Terminal, Trash2, Download, ChevronDown, ChevronUp } from 'lucide-react';

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'info' | 'success' | 'warning' | 'error' | 'ai';
  message: string;
  details?: string;
}

interface DebugConsoleProps {
  logs: LogEntry[];
  onClear: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const typeStyles: Record<LogEntry['type'], { bg: string; text: string; label: string }> = {
  info: { bg: 'bg-blue-500/10', text: 'text-blue-600', label: 'INFO' },
  success: { bg: 'bg-green-500/10', text: 'text-green-600', label: '✓' },
  warning: { bg: 'bg-yellow-500/10', text: 'text-yellow-600', label: 'WARN' },
  error: { bg: 'bg-red-500/10', text: 'text-red-600', label: 'ERR' },
  ai: { bg: 'bg-purple-500/10', text: 'text-purple-600', label: 'AI' },
};

export function DebugConsole({ logs, onClear, isCollapsed = false, onToggleCollapse }: DebugConsoleProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleExport = () => {
    const content = logs.map(log => 
      `[${log.timestamp.toISOString()}] [${log.type.toUpperCase()}] ${log.message}${log.details ? '\n  ' + log.details : ''}`
    ).join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-log-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTime = (date: Date) => {
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    const time = date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit'
    });
    return `${time}.${ms}`;
  };

  return (
    <Card className="border-dashed">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Debug Console
            <Badge variant="secondary" className="text-xs">
              {logs.length} entries
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              disabled={logs.length === 0}
              title="Export logs"
            >
              <Download className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              disabled={logs.length === 0}
              title="Clear logs"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
            {onToggleCollapse && (
              <Button variant="ghost" size="sm" onClick={onToggleCollapse}>
                {isCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {!isCollapsed && (
        <CardContent className="pt-0">
          <ScrollArea 
            className="h-[200px] rounded-md border bg-muted/30 font-mono text-xs"
            ref={scrollRef}
          >
            <div className="p-2 space-y-1">
              {logs.length === 0 ? (
                <div className="text-muted-foreground text-center py-8">
                  No logs yet. Process some posts to see AI activity.
                </div>
              ) : (
                logs.map((log) => {
                  const style = typeStyles[log.type];
                  return (
                    <div key={log.id} className="flex items-start gap-2 hover:bg-muted/50 rounded px-1">
                      <span className="text-muted-foreground shrink-0">
                        {formatTime(log.timestamp)}
                      </span>
                      <Badge 
                        variant="outline" 
                        className={`${style.bg} ${style.text} text-[10px] px-1 py-0 shrink-0`}
                      >
                        {style.label}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <span className={log.type === 'error' ? 'text-red-600' : ''}>{log.message}</span>
                        {log.details && (
                          <div className="text-muted-foreground mt-0.5 break-all">{log.details}</div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      )}
    </Card>
  );
}

// Hook to manage debug logs
export function useDebugLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = (type: LogEntry['type'], message: string, details?: string) => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      type,
      message,
      details,
    };
    setLogs((prev) => [...prev, entry]);
  };

  const clearLogs = () => setLogs([]);

  return {
    logs,
    addLog,
    clearLogs,
    info: (msg: string, details?: string) => addLog('info', msg, details),
    success: (msg: string, details?: string) => addLog('success', msg, details),
    warning: (msg: string, details?: string) => addLog('warning', msg, details),
    error: (msg: string, details?: string) => addLog('error', msg, details),
    ai: (msg: string, details?: string) => addLog('ai', msg, details),
  };
}
