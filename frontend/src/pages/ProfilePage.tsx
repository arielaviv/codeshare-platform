import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import Navbar from '../components/Navbar';
import PostCard from '../components/PostCard';
import { Post } from '../types';

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

  const { data: postsData, refetch } = useQuery({
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
    } catch (err) {
      console.error('Update failed:', err);
    }
  };

  const posts = postsData?.posts || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center space-x-4">
            {profile?.profileImage ? (
              <img
                src={`http://localhost:5000${profile.profileImage}`}
                alt={profile.username}
                className="w-20 h-20 rounded-full object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gray-300 flex items-center justify-center text-2xl">
                {profile?.username?.[0]?.toUpperCase()}
              </div>
            )}

            {editing ? (
              <div className="flex-1 space-y-2">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="Username"
                />
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="Bio"
                  rows={2}
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setProfileImage(e.target.files?.[0] || null)}
                />
                <div className="flex space-x-2">
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-blue-600 text-white rounded"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="px-4 py-2 text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1">
                <h1 className="text-2xl font-bold">{profile?.username}</h1>
                <p className="text-gray-600">{profile?.bio || 'No bio yet'}</p>
                {isOwnProfile && (
                  <button
                    onClick={handleEdit}
                    className="mt-2 text-blue-600 hover:underline"
                  >
                    Edit Profile
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <h2 className="text-xl font-bold mb-4">Posts ({posts.length})</h2>
        <div className="space-y-6">
          {posts.map((post: Post) => (
            <PostCard key={post._id} post={post} onUpdate={refetch} />
          ))}
        </div>
      </main>
    </div>
  );
}
