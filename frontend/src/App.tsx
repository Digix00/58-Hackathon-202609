import { RouterProvider } from 'react-router'
import { DisplaySettingsProvider } from './app/providers/DisplaySettingsProvider'
import { RuntimeProvider } from './app/providers/RuntimeProvider'
import { router } from './app/routes'
import './app/styles.css'

export default function App() {
  return (
    <RuntimeProvider>
      <DisplaySettingsProvider>
        <RouterProvider router={router} />
      </DisplaySettingsProvider>
    </RuntimeProvider>
  )
}
