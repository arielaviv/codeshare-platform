import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import FeedCard from '../components/feed/FeedCard';
import { Post } from '../types';
import { getStaticBase } from '../lib/apiBase';

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user, updateUser } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [profileImage, setProfileImage] = useState<File | null>(null);

  const isOwnProfile = user?.id === id;

  const { data: profile } = useQuery({
    queryKey: ['user', id],
    queryFn: async () => {
      const { data } = await api.get(`/users/${id}`);
      return data;
    },
  });

  const { data: postsData } = useQuery({
    queryKey: ['userPosts', id],
    queryFn: async () => {
      const { data } = await api.get(`/users/${id}/posts`);
      return data;
    },
  });

  const handleEdit = () => {
    setUsername(profile?.username || '');
    setBio(profile?.bio || '');
    setEditing(true);
  };

  const handleSave = async () => {
    const formData = new FormData();
    if (username) formData.append('username', username);
    if (bio) formData.append('bio', bio);
    if (profileImage) formData.append('profileImage', profileImage);

    try {
      const { data } = await api.put(`/users/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      updateUser(data.user);
      queryClient.invalidateQueries({ queryKey: ['user', id] });
      setEditing(false);
    } catch {
      // handled by UI state
    }
  };

  const posts = postsData?.posts || [];

  return (
    <div className="max-w-3xl px-6 py-6">
      <h1 className="section-label px-0 mb-4">Profile</h1>

      <div className="border border-edge dark:border-dark-border rounded p-6 bg-white dark:bg-dark-surface mb-6">
        <div className="flex items-center gap-4">
          {profile?.profileImage ? (
            <img
              src={`${getStaticBase()}${profile.profileImage}`}
              alt={profile.username}
              className="w-16 h-16 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-surface-tertiary dark:bg-dark-border text-ink-secondary dark:text-dark-text-secondary text-xl font-medium flex items-center justify-center flex-shrink-0">
              {profile?.username?.[0]?.toUpperCase()}
            </div>
          )}

          {editing ? (
            <div className="flex-1 space-y-2">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border border-edge dark:border-dark-border rounded text-sm bg-white dark:bg-dark-surface focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="Username"
              />
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full px-3 py-2 border border-edge dark:border-dark-border rounded text-sm bg-white dark:bg-dark-surface focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="Bio"
                rows={2}
              />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setProfileImage(e.target.files?.[0] || null)}
                className="text-sm text-ink-secondary"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-accent text-white rounded text-sm hover:bg-accent-hover transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 text-ink-secondary text-sm hover:text-ink transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1">
              <h2 className="text-lg font-bold">{profile?.username}</h2>
              <p className="text-sm text-ink-secondary dark:text-dark-text-secondary">{profile?.bio || 'No bio yet'}</p>
              {isOwnProfile && (
                <button
                  onClick={handleEdit}
                  className="mt-2 text-sm text-accent hover:underline"
                >
                  Edit Profile
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <h2 className="section-label px-0 mb-3">Posts ({posts.length})</h2>
      <div className="space-y-4">
        {posts.map((post: Post) => (
          <FeedCard key={post._id} post={post} />
        ))}
      </div>
    </div>
  );
}
