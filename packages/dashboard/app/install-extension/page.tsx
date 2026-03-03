'use client';

import { useEffect, useState } from 'react';

export default function InstallExtensionPage() {
  const [platform, setPlatform] = useState<'windows' | 'unix'>('windows');
  const [copiedKey, setCopiedKey] = useState<'install' | 'uninstall' | null>(null);

  useEffect(() => {
    const userPlatform = window.navigator.platform.toLowerCase();
    if (userPlatform.includes('win')) {
      setPlatform('windows');
      return;
    }
    setPlatform('unix');
  }, []);

  const installCommand =
    platform === 'windows'
      ? `cd %USERPROFILE%\\Desktop
mkdir thecopilotmarketer-extension
cd thecopilotmarketer-extension
git clone https://github.com/jeremytubongbanua/ws_submission.git
cd ws_submission`
      : `cd ~/Desktop
mkdir -p thecopilotmarketer-extension
cd thecopilotmarketer-extension
git clone https://github.com/jeremytubongbanua/ws_submission.git
cd ws_submission`;

  const uninstallCommand =
    platform === 'windows'
      ? `cd %USERPROFILE%\\Desktop
rmdir /s /q thecopilotmarketer-extension`
      : `cd ~/Desktop
rm -rf thecopilotmarketer-extension`;

  const copyCode = async (value: string, key: 'install' | 'uninstall') => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
    }, 1500);
  };

  return (
    <main className="min-h-screen px-4 py-8 md:px-8 lg:px-12">
      <section className="mx-auto max-w-4xl rounded-3xl border border-black/10 bg-white p-6 shadow-card md:p-8">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-tide/60"
        >
          Back
        </button>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-tide">TheCopilotMarketer</p>
        <h1 className="mt-3 text-3xl font-bold md:text-4xl">Install Chrome Extension</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/75">
          The dashboard cannot directly install a Chrome extension for you from a normal web page.
          The current supported path is to load the extension as an unpacked extension in Chrome.
        </p>

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-black/10 bg-[#fcfbf8] p-5">
            <h2 className="text-lg font-semibold">Install Flow</h2>
            <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6 text-ink/80">
              <li>Clone the repo over HTTPS.</li>
              <li>
                <div className="mb-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPlatform('windows')}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      platform === 'windows'
                        ? 'border border-tide bg-tide text-white'
                        : 'border border-black/10 bg-white text-ink'
                    }`}
                  >
                    Windows
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlatform('unix')}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      platform === 'unix'
                        ? 'border border-tide bg-tide text-white'
                        : 'border border-black/10 bg-white text-ink'
                    }`}
                  >
                    macOS / Linux
                  </button>
                </div>
                <div className="relative mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      void copyCode(installCommand, 'install');
                    }}
                    className="absolute right-3 top-3 rounded-md border border-white/10 bg-white/10 px-2 py-1 text-xs font-semibold text-white hover:bg-white/20"
                    aria-label="Copy install command"
                  >
                    {copiedKey === 'install' ? 'Copied' : 'Copy'}
                  </button>
                  <pre className="overflow-auto rounded-xl bg-[#0f1820] p-3 pr-20 text-xs text-[#d8fff7]">
{installCommand}
                  </pre>
                </div>
              </li>
              <li>
                Open{' '}
                <a
                  href="chrome://extensions"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-tide underline underline-offset-2"
                >
                  chrome://extensions
                </a>{' '}
                in Chrome.
              </li>
              <li>Turn on Developer Mode.</li>
              <li>Click <code>Load unpacked</code>.</li>
              <li>Select the <code>packages/chrome_extension</code> folder from this project.</li>
              <li>Pin the extension and open the side panel while reviewing posts.</li>
            </ol>
          </article>

          <article className="rounded-2xl border border-black/10 bg-[#f7f3e8] p-5">
            <h2 className="text-lg font-semibold">Uninstall</h2>
            <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6 text-ink/80">
              <li>
                Remove the unpacked extension from{' '}
                <a
                  href="chrome://extensions"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-tide underline underline-offset-2"
                >
                  chrome://extensions
                </a>{' '}
                by clicking <code>Remove</code>.
              </li>
              <li>
                Delete the local repo clone from your Desktop with the terminal command below.
                <div className="mb-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPlatform('windows')}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      platform === 'windows'
                        ? 'border border-tide bg-tide text-white'
                        : 'border border-black/10 bg-white text-ink'
                    }`}
                  >
                    Windows
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlatform('unix')}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      platform === 'unix'
                        ? 'border border-tide bg-tide text-white'
                        : 'border border-black/10 bg-white text-ink'
                    }`}
                  >
                    macOS / Linux
                  </button>
                </div>
                <div className="relative mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      void copyCode(uninstallCommand, 'uninstall');
                    }}
                    className="absolute right-3 top-3 rounded-md border border-white/10 bg-white/10 px-2 py-1 text-xs font-semibold text-white hover:bg-white/20"
                    aria-label="Copy uninstall command"
                  >
                    {copiedKey === 'uninstall' ? 'Copied' : 'Copy'}
                  </button>
                  <pre className="overflow-auto rounded-xl bg-[#0f1820] p-3 pr-20 text-xs text-[#d8fff7]">
{uninstallCommand}
                  </pre>
                </div>
              </li>
            </ol>
          </article>
        </section>
      </section>
    </main>
  );
}
