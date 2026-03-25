import { useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import CloseIcon from '@mui/icons-material/Close'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ArtifactDialogProps {
  /** API URL to fetch artifact content. Response must be JSON with a `content` field. */
  url: string | null
  /** Display title for the dialog header */
  title?: string
  onClose: () => void
}

export default function ArtifactDialog({ url, title, onClose }: ArtifactDialogProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!url) {
      setContent(null)
      return
    }
    setLoading(true)
    setError(null)
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        setContent(data.content)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [url])

  const isYaml = title?.endsWith('.yaml') || title?.endsWith('.yml')

  return (
    <Dialog
      open={url !== null}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      scroll="paper"
      slotProps={{ paper: { sx: { maxHeight: '85vh' } } }}
    >
      {url && (
        <>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 6 }}>
            <Typography variant="titleMedium" sx={{ flex: 1 }}>{title ?? 'Artifact'}</Typography>
            <IconButton
              onClick={onClose}
              aria-label="Close artifact"
              sx={{ position: 'absolute', right: 8, top: 8 }}
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <Box sx={{ px: 3, pb: 3, overflowY: 'auto' }}>
            {loading ? (
              <Box>
                <Skeleton variant="text" width="80%" />
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="rectangular" height={120} sx={{ mt: 1, borderRadius: 1 }} />
              </Box>
            ) : error ? (
              <Typography color="error">Failed to load artifact: {error}</Typography>
            ) : content !== null ? (
              isYaml ? (
                <Box
                  component="pre"
                  sx={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8rem',
                    bgcolor: 'action.hover',
                    p: 2,
                    borderRadius: 1,
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {content}
                </Box>
              ) : (
                <Box
                  sx={{
                    '& h1': { typography: 'h5', mt: 3, mb: 1.5 },
                    '& h2': { typography: 'h6', mt: 2.5, mb: 1 },
                    '& h3': { typography: 'titleMedium', mt: 2, mb: 1 },
                    '& p': { typography: 'body2', mb: 1.5 },
                    '& ul, & ol': { pl: 3, mb: 1.5 },
                    '& li': { typography: 'body2', mb: 0.5 },
                    '& code': {
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.85em',
                      bgcolor: 'action.hover',
                      px: 0.5,
                      py: 0.25,
                      borderRadius: 0.5,
                    },
                    '& pre': {
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.8rem',
                      bgcolor: 'action.hover',
                      p: 2,
                      borderRadius: 1,
                      overflowX: 'auto',
                      mb: 1.5,
                    },
                    '& pre code': { bgcolor: 'transparent', p: 0 },
                    '& table': {
                      width: '100%',
                      borderCollapse: 'collapse',
                      mb: 1.5,
                    },
                    '& th, & td': {
                      border: '1px solid',
                      borderColor: 'divider',
                      px: 1.5,
                      py: 0.75,
                      typography: 'body2',
                    },
                    '& th': { bgcolor: 'action.hover', fontWeight: 600 },
                    '& blockquote': {
                      borderLeft: '3px solid',
                      borderColor: 'primary.main',
                      pl: 2,
                      ml: 0,
                      my: 1.5,
                      color: 'text.secondary',
                    },
                    '& hr': { borderColor: 'divider', my: 2 },
                    '& input[type="checkbox"]': { mr: 1 },
                  }}
                >
                  <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
                </Box>
              )
            ) : null}
          </Box>
        </>
      )}
    </Dialog>
  )
}
