import { HeroBlock } from './HeroBlock'
import { BasicCtaBlock } from './BasicCtaBlock'
import { FeaturesGridBlock } from './FeaturesGridBlock'
import { AboutTheCreatorBlock } from './AboutTheCreatorBlock'

interface Block {
  _type: string
  [key: string]: unknown
}

interface BlockRendererProps {
  blocks: Block[]
}

const darkSectionStyle = {
  '--background': 'oklch(0.145 0 0)',
  '--foreground': 'oklch(0.985 0 0)',
  '--muted-foreground': 'oklch(0.708 0 0)',
  '--muted': 'oklch(0.269 0 0)',
  '--border': 'oklch(0.269 0 0)',
  '--card': 'oklch(0.205 0 0)',
  '--card-foreground': 'oklch(0.985 0 0)',
  backgroundColor: 'oklch(0.145 0 0)',
} as React.CSSProperties

export function BlockRenderer({ blocks }: BlockRendererProps) {
  if (!blocks || blocks.length === 0) return null

  return (
    <>
      {blocks.map((block, index) => {
        const { _type, ...props } = block
        const isOdd = index % 2 === 1

        let content: React.ReactNode = null

        switch (_type) {
          case 'hero':
            content = <HeroBlock {...(props as unknown as React.ComponentProps<typeof HeroBlock>)} />
            break

          case 'basic_cta':
            content = <BasicCtaBlock {...(props as unknown as React.ComponentProps<typeof BasicCtaBlock>)} />
            break

          case 'features_grid':
            content = (
              <FeaturesGridBlock
                title={props.title as string | undefined}
                subtitle={props.subtitle as string | undefined}
                features={props.features as Array<{ _type: string; feature_name: string; feature_description?: string; feature_icon?: string }> | undefined}
              />
            )
            break

          case 'about_the_creator':
            content = (
              <AboutTheCreatorBlock
                title={props.title as string}
                subtitle={props.subtitle as string | undefined}
                content={props.content as string | undefined}
              />
            )
            break

          default:
            if (process.env.NODE_ENV === 'development') {
              content = (
                <div className="mx-auto my-8 max-w-5xl rounded-lg border border-dashed border-amber-300 bg-amber-50 px-6 py-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                  <p className="font-medium">Unknown block type: {_type}</p>
                  <pre className="mt-2 overflow-auto text-xs">
                    {JSON.stringify(props, null, 2)}
                  </pre>
                </div>
              )
            }
        }

        if (!content) return null

        return isOdd ? (
          <div key={index} className="dark" style={darkSectionStyle}>
            {content}
          </div>
        ) : (
          <div key={index}>{content}</div>
        )
      })}
    </>
  )
}
