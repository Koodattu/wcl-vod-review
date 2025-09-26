'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [wclUrl, setWclUrl] = useState('');
  const [vodUrl, setVodUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Parse URLs via backend API
      const response = await fetch('http://localhost:3001/api/parse-urls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wclUrl,
          vodUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse URLs');
      }

      // Navigate to timeline view with parsed data
      const params = new URLSearchParams({
        wclCode: data.wcl.code,
        vodPlatform: data.vod.platform,
        vodId: data.vod.id,
        ...(data.wcl.fight && { fightId: data.wcl.fight.toString() }),
        ...(data.vod.startSeconds && { startSeconds: data.vod.startSeconds.toString() }),
      });

      router.push(`/timeline?${params.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            WoW Logs + VOD Sync
          </h1>
          <p className="text-lg text-gray-600">
            Sync Warcraft Logs events with your YouTube VOD timeline
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="wclUrl" className="block text-sm font-medium text-gray-700 mb-2">
                Warcraft Logs URL
              </label>
              <input
                id="wclUrl"
                type="url"
                value={wclUrl}
                onChange={(e) => setWclUrl(e.target.value)}
                placeholder="https://www.warcraftlogs.com/reports/..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="text-sm text-gray-500 mt-1">
                Example: https://www.warcraftlogs.com/reports/ABC123#fight=1
              </p>
            </div>

            <div>
              <label htmlFor="vodUrl" className="block text-sm font-medium text-gray-700 mb-2">
                YouTube VOD URL
              </label>
              <input
                id="vodUrl"
                type="url"
                value={vodUrl}
                onChange={(e) => setVodUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="text-sm text-gray-500 mt-1">
                Example: https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=123s
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Processing...' : 'Create Timeline'}
            </button>
          </form>
        </div>

        <div className="mt-8 text-center">
          <div className="bg-white rounded-lg shadow-md p-4">
            <h3 className="font-semibold text-gray-800 mb-2">Backend Status</h3>
            <div className="text-sm space-y-1">
              <div className="text-green-600">✅ TypeScript + MongoDB</div>
              <div className="text-green-600">✅ WCL API integration</div>
              <div className="text-green-600">✅ URL parsing utilities</div>
              <div className="text-blue-600">🚀 Ready for timeline!</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}