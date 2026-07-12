import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt =
  'Humanly — every piece of writing has a story. Now you can prove it.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Brand share card for link previews (Slack, X, WeChat). Typographic on the
// Atelier paper background so it needs no binary asset.
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#FAF9F6',
          padding: '72px 84px',
          fontFamily: 'monospace',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 9999,
              backgroundColor: '#B08D84',
            }}
          />
          <div
            style={{
              fontSize: 44,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: '#232019',
            }}
          >
            humanly
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div
            style={{
              fontSize: 74,
              fontWeight: 700,
              lineHeight: 1.12,
              letterSpacing: '-0.03em',
              color: '#232019',
            }}
          >
            Every piece of writing
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 74,
              fontWeight: 700,
              lineHeight: 1.12,
              letterSpacing: '-0.03em',
              color: '#232019',
            }}
          >
            has a&nbsp;<span style={{ color: '#B08D84' }}>story</span>.
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 34,
              color: '#7a756a',
            }}
          >
            Now you can prove it. — writehumanly.net
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            width: '100%',
            height: 6,
            backgroundColor: '#B08D84',
            borderRadius: 3,
          }}
        />
      </div>
    ),
    size
  );
}
