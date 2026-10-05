import { setTheme, themes, useTheme } from './themePreference'
import './appearance.css'

const themeLabels = { sage: 'Sage', ocean: 'Ocean', dark: 'Dark' }

export function AppearanceSection() {
  const selectedTheme = useTheme()

  return (
    <section className="appearance-section" aria-labelledby="appearance-heading">
      <h3 id="appearance-heading">Appearance</h3>
      <fieldset className="appearance-choices">
        <legend className="appearance-sr-only">Theme</legend>
        {themes.map((theme) => (
          <label className="appearance-choice" key={theme}>
            <input type="radio" name="appearance-theme" value={theme}
              checked={selectedTheme === theme} onChange={() => setTheme(theme)} />
            <span className="appearance-preview" data-theme={theme} aria-hidden="true">
              <span /><span />
            </span>
            <span className="appearance-name">{themeLabels[theme]}</span>
            <span className="appearance-selected" aria-hidden="true">
              Selected
            </span>
          </label>
        ))}
      </fieldset>
    </section>
  )
}
