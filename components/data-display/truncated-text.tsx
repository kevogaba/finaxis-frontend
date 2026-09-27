import Typography from '@mui/material/Typography';
import type { TypographyProps } from '@mui/material/Typography';

interface TruncatedTextProps {
  value: string;
  maxWidth: number | string;
  variant?: TypographyProps['variant'];
  color?: TypographyProps['color'];
}

/** Single-line text that truncates with an ellipsis and keeps the full value in `title`. */
export function TruncatedText({ value, maxWidth, variant = 'body2', color }: TruncatedTextProps) {
  return (
    <Typography
      component="span"
      variant={variant}
      color={color}
      noWrap
      title={value}
      sx={{ display: 'block', maxWidth }}
    >
      {value}
    </Typography>
  );
}
