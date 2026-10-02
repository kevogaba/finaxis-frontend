import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Typography from '@mui/material/Typography';
import type { ProblemView } from '@/lib/api/problem';

/** Safe failure message with the backend request id as a support reference. */
export function ErrorState({ problem }: { problem: ProblemView }) {
  return (
    <Alert severity="error" sx={{ m: 4 }}>
      <AlertTitle>{problem.title}</AlertTitle>
      {problem.message}
      {problem.requestId && (
        <Typography variant="caption" component="p" sx={{ mt: 1 }}>
          Reference: {problem.requestId}
        </Typography>
      )}
    </Alert>
  );
}
