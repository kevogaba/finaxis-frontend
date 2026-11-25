import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import type { CheckerNote as Note } from '../checker-rules';

/** The platform-checker window above a tab's list (BG-02): an info note while a platform
 * administrator may act here, and once the institution has its own approvers, a note that says so.
 * A note, not an alert: it is the page's state, not news. Server-Component-safe. */
export function CheckerNote({ note }: { note: Note | null }) {
  if (!note) return null;
  return (
    // ListToolbar's inset, so the note lines up with the search field below it.
    <Box sx={{ px: 3.5, pt: 2.5 }}>
      <Alert severity={note.open ? 'info' : 'success'} role="note">
        {note.text}
      </Alert>
    </Box>
  );
}
