import {
  BatteryCharging,
  Camera,
  Headphones,
  Layers,
  PlugZap,
  Shield,
  Smartphone,
  Wrench,
} from 'lucide-react';
import { cn } from '@/utils/cn';

interface ServiceIconBadgeProps {
  groupName: string;
  className?: string;
}

export function ServiceIconBadge({ groupName, className }: ServiceIconBadgeProps) {
  const key = groupName.toLocaleLowerCase('tr-TR');

  let tone =
    'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-400/35';
  let Icon = Wrench;

  if (key.includes('ekran')) {
    tone =
      'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-400/35';
    Icon = Smartphone;
  } else if (key.includes('batarya')) {
    tone =
      'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/35';
    Icon = BatteryCharging;
  } else if (key.includes('kapak')) {
    tone =
      'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-400/35';
    Icon = Shield;
  } else if (key.includes('kamera')) {
    tone =
      'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-500/20 dark:text-sky-300 dark:border-sky-400/35';
    Icon = Camera;
  } else if (key.includes('soket')) {
    tone =
      'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-400/35';
    Icon = PlugZap;
  } else if (key.includes('ahize')) {
    tone =
      'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-400/35';
    Icon = Headphones;
  } else if (key.includes('cam')) {
    tone =
      'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-400/35';
    Icon = Layers;
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-6.5 shrink-0 items-center justify-center rounded-md border',
        tone,
        className,
      )}
    >
      <Icon className="size-3.5 stroke-[1.7]" />
    </span>
  );
}
