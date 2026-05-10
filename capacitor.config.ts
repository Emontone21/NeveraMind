import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.emontone.neveramind',
  appName: 'NeveraMind',
  webDir: 'dist',
  // Allow WKWebView to make network calls to Supabase and Gemini
  server: {
    androidScheme: 'https',
    allowNavigation: [
      '*.supabase.co',
      'generativelanguage.googleapis.com',
      'fonts.googleapis.com',
      'fonts.gstatic.com',
    ],
  },
  ios: {
    // 'always' ensures content never hides behind the notch/Dynamic Island
    contentInset: 'always',
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
}

export default config
