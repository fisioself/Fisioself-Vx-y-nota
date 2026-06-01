interface AppLogoProps {
  size?: number;
  pulse?: boolean;
  className?: string;
}

export function AppLogo({ size = 56, pulse = false, className }: AppLogoProps) {
  return (
    <img
      src="/icons/icon.svg"
      alt="FISIOSELF"
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.25,
        flexShrink: 0,
        animation: pulse ? 'logo-pulse 1.6s ease-in-out infinite' : undefined
      }}
    />
  );
}
