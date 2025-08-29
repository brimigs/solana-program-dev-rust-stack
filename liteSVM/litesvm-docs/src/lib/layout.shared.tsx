import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

/**
 * Shared layout configurations
 *
 * you can customise layouts individually from:
 * Home Layout: app/(home)/layout.tsx
 * Docs Layout: app/docs/layout.tsx
 */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: 'LiteSVM Docs',
    },
    githubUrl: 'https://github.com/LiteSVM/litesvm',
    links: [
      {
        text: 'GitHub',
        url: 'https://github.com/LiteSVM/litesvm',
      },
      {
        text: 'LiteSVM Crate',
        url: 'https://crates.io/crates/litesvm',
      },
      {
        text: 'LiteSVM-Token Crate',
        url: 'https://crates.io/crates/litesvm-token',
      },
    ],
  };
}
