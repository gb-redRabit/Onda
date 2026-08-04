export interface ImageTransitionStyle {
  opacity: number;
  transform: string;
  filter: string;
}

export function computeEnterStart(
  transition: string,
  direction: 'next' | 'prev'
): ImageTransitionStyle {
  switch (transition) {
    case 'fade':
      return { opacity: 0, transform: 'translateX(0) scale3d(1,1,1)', filter: 'blur(0px)' };
    case 'slide':
      return direction === 'next'
        ? { opacity: 1, transform: 'translateX(15%) scale3d(0.95,0.95,1)', filter: 'blur(4px)' }
        : { opacity: 1, transform: 'translateX(-15%) scale3d(0.95,0.95,1)', filter: 'blur(4px)' };
    case 'zoom':
      return { opacity: 0, transform: 'translateX(0) scale3d(0.7,0.7,1)', filter: 'blur(0px)' };
    case 'swirl':
      return {
        opacity: 0,
        transform: 'translateX(0) scale3d(0.5,0.5,1) rotate(-15deg)',
        filter: 'blur(6px)'
      };
    case 'slideUp':
      return { opacity: 1, transform: 'translateY(15%) scale3d(0.95,0.95,1)', filter: 'blur(4px)' };
    case 'slideDown':
      return {
        opacity: 1,
        transform: 'translateY(-15%) scale3d(0.95,0.95,1)',
        filter: 'blur(4px)'
      };
    case 'zoomOut':
      return { opacity: 0, transform: 'translateX(0) scale3d(1.3,1.3,1)', filter: 'blur(0px)' };
    default:
      return { opacity: 1, transform: 'translateX(0) scale3d(1,1,1)', filter: 'blur(0px)' };
  }
}

export function computeOldExit(
  transition: string,
  direction: 'next' | 'prev'
): ImageTransitionStyle {
  switch (transition) {
    case 'fade':
      return { opacity: 0, transform: 'translateX(0) scale3d(1.05,1.05,1)', filter: 'blur(0px)' };
    case 'slide':
      return direction === 'next'
        ? { opacity: 0, transform: 'translateX(-15%) scale3d(0.95,0.95,1)', filter: 'blur(4px)' }
        : { opacity: 0, transform: 'translateX(15%) scale3d(0.95,0.95,1)', filter: 'blur(4px)' };
    case 'zoom':
      return { opacity: 0, transform: 'translateX(0) scale3d(1.2,1.2,1)', filter: 'blur(0px)' };
    case 'swirl':
      return {
        opacity: 0,
        transform: 'translateX(0) scale3d(1.3,1.3,1) rotate(15deg)',
        filter: 'blur(6px)'
      };
    case 'slideUp':
      return {
        opacity: 0,
        transform: 'translateY(-15%) scale3d(0.95,0.95,1)',
        filter: 'blur(4px)'
      };
    case 'slideDown':
      return { opacity: 0, transform: 'translateY(15%) scale3d(0.95,0.95,1)', filter: 'blur(4px)' };
    case 'zoomOut':
      return { opacity: 0, transform: 'translateX(0) scale3d(0.7,0.7,1)', filter: 'blur(0px)' };
    default:
      return { opacity: 0, transform: 'translateX(0) scale3d(1,1,1)', filter: 'blur(0px)' };
  }
}
