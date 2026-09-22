import { RouterProvider } from 'react-router'
import { DisplaySettingsProvider } from './app/providers/DisplaySettingsProvider'
import { RuntimeProvider } from './app/providers/RuntimeProvider'
import { router } from './app/routes'
import { CrayonFilters } from './shared/components/CrayonFilters'
import './app/styles.css'

export default function App() {
  return (
    <RuntimeProvider>
      <DisplaySettingsProvider>
        <CrayonFilters />
        <RouterProvider router={router} />
      </DisplaySettingsProvider>
    </RuntimeProvider>
  )
}
