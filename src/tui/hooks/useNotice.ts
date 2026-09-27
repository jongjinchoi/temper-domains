import { useEffect, useRef, useState } from "react";

type Notice = { text: string; error?: boolean; neutral?: boolean };
export function useNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const current = useRef(0);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const begin = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    return ++current.current;
  };
  const complete = (id: number, value: Notice, duration?: number) => {
    if (!mounted.current || id !== current.current) return;
    clearTimeout(timer.current);
    setNotice(value);
    if (duration !== undefined) timer.current = setTimeout(() => {
      if (mounted.current && id === current.current) setNotice(null);
    }, duration);
  };
  const show = (value: Notice, duration?: number) => complete(begin(), value, duration);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; begin(); };
  }, []);
  return { notice, begin, complete, show };
}
