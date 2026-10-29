export type ButtonVariant = 'solid' | 'soft' | 'outline' | 'ghost' | 'danger' | 'overlay';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

// Wspólna baza: fokus widoczny także w forced-colors, aktywny stan bez layoutu,
// wyłączony stan spójny z resztą aplikacji (45%).
export const buttonBase =
  'relative inline-flex select-none items-center justify-center font-medium transition-[color,background-color,box-shadow,transform] duration-150 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' +
  'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45';

export const buttonVariants: Record<ButtonVariant, string> = {
  solid: 'bg-primary text-primary-content hover:bg-primary/90',
  soft: 'bg-primary/12 text-primary-text hover:bg-primary/20',
  outline: 'border border-base-content/15 text-base-content hover:bg-base-content/8',
  ghost: 'text-base-content/70 hover:bg-base-content/8 hover:text-base-content',
  danger: 'bg-error/12 text-error hover:bg-error/20',
  overlay: 'bg-base-300/80 text-base-content/80 backdrop-blur-sm hover:bg-base-300'
};

export const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-7 gap-1.5 rounded-field px-2.5 text-xs',
  md: 'h-8 gap-2 rounded-field px-3 text-sm',
  lg: 'h-10 gap-2 rounded-box px-4 text-sm',
  icon: 'size-8 rounded-field'
};
