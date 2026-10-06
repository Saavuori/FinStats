import type { CubeCategory, CubeDim } from '../lib/jsonstat'

interface Props {
  fixed: { dim: CubeDim; category: CubeCategory }[]
}

/**
 * What a view is "of": every dimension held at a single value, e.g.
 * "Area: Tampere · Information: Population 31 Dec". Without it a chart (or a
 * screenshot of one) doesn't say what it shows.
 */
function Caption({ fixed }: Props) {
  if (!fixed.length) return null
  return (
    <p className="caption">
      {fixed.map(({ dim, category }) => (
        <span key={dim.id}>
          <span className="caption-dim">{dim.label}</span> {category.label}
        </span>
      ))}
    </p>
  )
}

export default Caption
