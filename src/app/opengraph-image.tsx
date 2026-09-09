import { ImageResponse } from 'next/og'

export const alt = 'Postwise — your work, written up'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'center', padding: '80px',
          background: '#09090b', color: '#fafafa',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 12, background: '#fafafa', color: '#09090b',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, fontWeight: 700,
          }}>P</div>
          <div style={{ fontSize: 34, fontWeight: 600 }}>Postwise</div>
        </div>
        <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.15, maxWidth: 900 }}>
          Your work, written up.
        </div>
        <div style={{ fontSize: 28, color: '#a1a1aa', marginTop: 28, maxWidth: 880, lineHeight: 1.4 }}>
          Reads your commits. Asks one question a night. Turns a week of real work
          into drafts that sound like you.
        </div>
      </div>
    ),
    size,
  )
}
