import React from 'react';
import { PowerUpType } from '../game/types';

interface PowerUpIconProps {
  type: PowerUpType;
  className?: string;
}

export const PowerUpIcon: React.FC<PowerUpIconProps> = ({ type, className = 'w-4 h-4' }) => {
  switch (type) {
    case 'speed':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M13 2L4.5 13.5H11.5L10.5 22L19.5 10.5H12.5L13 2Z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'magnet':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M6 4V11C6 14.3137 8.68629 17 12 17C15.3137 17 18 14.3137 18 11V4"
            stroke="currentColor"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path d="M4.5 4H7.5M16.5 4H19.5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 20.5V22.5M8.5 19.5L7.5 21M15.5 19.5L16.5 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'shield':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M12 2.5L4.5 5.5V11.2C4.5 16.1 7.7 20.6 12 22C16.3 20.6 19.5 16.1 19.5 11.2V5.5L12 2.5Z"
            fill="currentColor"
            fillOpacity="0.25"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <path
            d="M9.2 12.2L11.2 14.2L15 10"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'surge':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <circle cx="9" cy="8" r="3" fill="currentColor" />
          <path d="M4 18C4 15.2 6.2 13 9 13C11.8 13 14 15.2 14 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M18 6V12M15 9H21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
  }
};
