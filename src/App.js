import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Clock, Youtube, Key, AlertTriangle, ListMusic, Loader2, Timer, Play, Pause, SkipForward, Save, Trash2, PanelLeftOpen, PanelLeftClose, XCircle, ArrowDownAZ, ArrowUpAZ, ListOrdered, Clock2 } from 'lucide-react';
import './App.css';

// IndexedDB関連のインポートと設定
import { openDB } from 'idb';

const DB_NAME = 'MusicPlaylisterDB';
const DB_VERSION = 1;
const STORE_NAME_PLAYLISTS = 'playlists';
const LOCAL_STORAGE_KEY_API_KEY = 'musicPlaylister_youtubeApiKey';


// Helper function to parse ISO 8601 duration
const parseISO8601Duration = (durationString) => {
    if (!durationString) return 0;
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?S))?/; 
    const matches = durationString.match(regex);
    if (!matches) return 0;
    const hours = parseInt(matches[1] || '0');
    const minutes = parseInt(matches[2] || '0');
    const seconds = parseFloat(matches[3]?.replace('S', '') || '0'); 
    return hours * 3600 + minutes * 60 + Math.floor(seconds); 
};

// Helper function to format seconds
const formatDuration = (totalSeconds) => {
    if (isNaN(totalSeconds) || totalSeconds < 0) return "00:00";
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const paddedMinutes = String(minutes).padStart(2, '0');
    const paddedSeconds = String(seconds).padStart(2, '0');
    if (hours > 0) {
        const paddedHours = String(hours).padStart(2, '0');
        return `${paddedHours}:${paddedMinutes}:${paddedSeconds}`;
    }
    return `${paddedMinutes}:${paddedSeconds}`;
};

// IndexedDBを開く関数
const initDB = async () => {
    const db = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME_PLAYLISTS)) {
                const store = db.createObjectStore(STORE_NAME_PLAYLISTS, { keyPath: 'id' });
                store.createIndex('createdAt', 'createdAt'); 
                store.createIndex('name', 'name'); // 名前でのソート用インデックス
            }
        },
    });
    return db;
};


// Main App Component
const App = () => {
    const [dbPromise, setDbPromise] = useState(null);

    const [youtubeApiKey, setYoutubeApiKey] = useState('');
    const [isApiKeySet, setIsApiKeySet] = useState(false);
    const [tempYoutubeApiKey, setTempYoutubeApiKey] = useState('');

    const [manualHours, setManualHours] = useState('');
    const [manualMinutes, setManualMinutes] = useState('');
    const [musicKeywords, setMusicKeywords] = useState('');
    
    const [travelTimeInfo, setTravelTimeInfo] = useState(null);
    const [generatedPlaylist, setGeneratedPlaylist] = useState([]);
    const [playlistTotalDuration, setPlaylistTotalDuration] = useState(0);
    const [currentPlaylistId, setCurrentPlaylistId] = useState(null); 

    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState('');
    const [showApiKeyModal, setShowApiKeyModal] = useState(true);

    const [youtubeApiReady, setYoutubeApiReady] = useState(false);
    const playerRef = useRef(null);
    const [currentPlayingInfo, setCurrentPlayingInfo] = useState(null); 
    const [isPlaying, setIsPlaying] = useState(false);

    const [savedPlaylists, setSavedPlaylists] = useState([]);
    const [showSavedPlaylistsPanel, setShowSavedPlaylistsPanel] = useState(false);
    const [playlistName, setPlaylistName] = useState('');
    const [showSaveModal, setShowSaveModal] = useState(false);

    // Sort state for saved playlists
    const [sortCriteria, setSortCriteria] = useState('createdAt'); 
    const [sortOrder, setSortOrder] = useState('desc'); 


    const currentPlayingInfoRef = useRef(currentPlayingInfo);
    useEffect(() => { currentPlayingInfoRef.current = currentPlayingInfo; }, [currentPlayingInfo]);

    const generatedPlaylistRef = useRef(generatedPlaylist);
    useEffect(() => { generatedPlaylistRef.current = generatedPlaylist; }, [generatedPlaylist]);

    const isPlayingRef = useRef(isPlaying);
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

    // Initialize IndexedDB
    useEffect(() => {
        setDbPromise(initDB());
    }, []);
    
    // Load API Key from local storage on initial load
    useEffect(() => {
        const storedApiKey = localStorage.getItem(LOCAL_STORAGE_KEY_API_KEY);
        if (storedApiKey) {
            setYoutubeApiKey(storedApiKey);
            setTempYoutubeApiKey(storedApiKey);
            setIsApiKeySet(true);
            setShowApiKeyModal(false);
        } else {
            setShowApiKeyModal(true);
        }
    }, []);
    
    // Load and sort saved playlists from IndexedDB
    const loadAndSortPlaylists = useCallback(async () => {
        if (!dbPromise) return;
        try {
            const db = await dbPromise;
            const tx = db.transaction(STORE_NAME_PLAYLISTS, 'readonly');
            const store = tx.objectStore(STORE_NAME_PLAYLISTS);
            let allPlaylists = await store.getAll();
            
            allPlaylists = allPlaylists.map(p => ({
                ...p,
                createdAt: new Date(p.createdAt),
                videoCount: p.videos?.length || 0,
            }));

            allPlaylists.sort((a, b) => {
                let comparison = 0;
                if (sortCriteria === 'name') {
                    comparison = a.name.localeCompare(b.name, 'ja');
                } else if (sortCriteria === 'createdAt') {
                    comparison = b.createdAt.getTime() - a.createdAt.getTime(); 
                } else if (sortCriteria === 'videoCount') {
                    comparison = a.videoCount - b.videoCount;
                } else if (sortCriteria === 'totalDuration') {
                    comparison = a.totalDuration - b.totalDuration;
                }

                return sortOrder === 'asc' ? comparison : -comparison;
            });
            
            setSavedPlaylists(allPlaylists);
        } catch (e) {
            console.error("Error loading or sorting playlists from IndexedDB:", e);
            setError("保存済みプレイリストの読み込みまたはソートに失敗しました。");
        }
    }, [dbPromise, sortCriteria, sortOrder]);

    useEffect(() => {
        loadAndSortPlaylists();
    }, [loadAndSortPlaylists]);


    // Load YouTube Iframe API
    useEffect(() => {
        if (window.YT && window.YT.Player) {
            setYoutubeApiReady(true);
            return;
        }
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api"; 
        const firstScriptTag = document.getElementsByTagName('script')[0];
        if (firstScriptTag && firstScriptTag.parentNode) {
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        } else {
            document.head.appendChild(tag);
        }
        window.onYouTubeIframeAPIReady = () => {
            console.log("YouTube Iframe API is ready.");
            setYoutubeApiReady(true);
        };
        return () => { delete window.onYouTubeIframeAPIReady; };
    }, []);

    const handleApiKeySubmit = () => {
        if (!tempYoutubeApiKey) {
            setError('YouTube Data APIキーを入力してください。');
            return;
        }
        setYoutubeApiKey(tempYoutubeApiKey);
        setIsApiKeySet(true);
        setShowApiKeyModal(false);
        setError('');
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY_API_KEY, tempYoutubeApiKey);
        } catch (e) {
            console.error("Error saving API key to local storage:", e);
            setError("APIキーの保存に失敗しました。");
        }
    };
    
    const fetchYoutubeVideos = useCallback(async (keywords) => {
        if (!youtubeApiKey) {
            setError('YouTube APIキーが設定されていません。');
            return [];
        }
        setLoadingMessage('YouTubeで楽曲を検索中...');
        setIsLoading(true);
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=50&q=${encodeURIComponent(keywords)}&type=video&videoCategoryId=10&key=${youtubeApiKey}`; 
        
        try {
            const searchResponse = await fetch(searchUrl);
            if (!searchResponse.ok) {
                const errorData = await searchResponse.json();
                throw new Error(`YouTube検索APIエラー: ${errorData.error?.message || searchResponse.statusText}`);
            }
            const searchData = await searchResponse.json();
            
            if (!searchData.items || searchData.items.length === 0) {
                console.log("キーワードに合う楽曲がYouTube検索で見つかりませんでした:", keywords);
                return [];
            }

            const videoIds = searchData.items.map(item => item.id.videoId).join(',');

            if (!videoIds) {
                return [];
            }

            const videosUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds}&key=${youtubeApiKey}`;
            const videosResponse = await fetch(videosUrl);
             if (!videosResponse.ok) {
                const errorData = await videosResponse.json();
                throw new Error(`YouTube動画詳細APIエラー: ${errorData.error?.message || videosResponse.statusText}`);
            }
            const videosData = await videosResponse.json();
            
            return videosData.items.map(item => ({
                id: item.id,
                title: item.snippet.title,
                durationSeconds: parseISO8601Duration(item.contentDetails.duration),
                thumbnailUrl: item.snippet.thumbnails.default.url,
                channelTitle: item.snippet.channelTitle,
            })).filter(video => video.durationSeconds > 0);
        } catch (err) {
            console.error("YouTube APIエラー:", err);
            setError(`YouTubeからの楽曲取得に失敗しました: ${err.message}。APIキーのクォータや権限を確認してください。`);
            return [];
        }  finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    }, [youtubeApiKey]);

    const generatePlaylistAlgorithm = (videos, targetDurationInSeconds) => {
        setLoadingMessage('プレイリストを生成中...');
        let bestPlaylistOverall = [];
        let bestDurationOverall = 0;

        if (!videos || videos.length === 0) {
            return [];
        }
        const attempts = 500; 

        for (let i = 0; i < attempts; i++) {
            const shuffledVideos = [...videos].sort(() => Math.random() - 0.5);
            let currentPlaylist = [];
            let currentDuration = 0;

            for (const video of shuffledVideos) {
                if (currentDuration + video.durationSeconds <= targetDurationInSeconds) {
                    currentPlaylist.push(video);
                    currentDuration += video.durationSeconds;
                }
            }
            
            if (currentDuration > bestDurationOverall) {
                bestDurationOverall = currentDuration;
                bestPlaylistOverall = currentPlaylist;
            }

            if (Math.abs(bestDurationOverall - targetDurationInSeconds) < 60 ) { 
                break;
            }
        }
        
        setPlaylistTotalDuration(bestDurationOverall);
        return bestPlaylistOverall.sort(() => Math.random() - 0.5);
    };
    
    const destroyPlayer = useCallback(() => {
        if (playerRef.current) {
            console.log("プレーヤーを破棄します (destroyPlayer)。");
            playerRef.current.destroy();
            playerRef.current = null;
        }
        setIsPlaying(false);
    }, []);


    const handleGeneratePlaylist = async () => {
        setCurrentPlayingInfo(null); 
        setCurrentPlaylistId(null); 
        await new Promise(resolve => setTimeout(resolve, 0));


        if (!isApiKeySet) {
            setError('APIキーを設定してください。');
            setShowApiKeyModal(true);
            return;
        }
        const hours = parseInt(manualHours) || 0;
        const minutes = parseInt(manualMinutes) || 0;
        const totalSeconds = (hours * 3600) + (minutes * 60);

        if (totalSeconds <= 0) {
            setError('有効な所要時間（1分以上）を入力してください。');
            return;
        }
        if (!musicKeywords) {
            setError('音楽のキーワードを入力してください。');
            return;
        }
        
        setError('');
        setGeneratedPlaylist([]);
        setTravelTimeInfo(null); 
        setPlaylistTotalDuration(0); 
        setIsLoading(true); 
        setLoadingMessage('準備中...');

        const timeInfo = {
            text: `${hours > 0 ? `${hours}時間 ` : ''}${minutes}分`,
            seconds: totalSeconds,
        };
        setTravelTimeInfo(timeInfo);

        try {
            const fetchedVideos = await fetchYoutubeVideos(musicKeywords);
            
            if (fetchedVideos.length > 0) {
                const playlist = generatePlaylistAlgorithm(fetchedVideos, timeInfo.seconds);
                setGeneratedPlaylist(playlist); 

                if (playlist.length === 0 && timeInfo.seconds > 0) {
                    const anyVideoIndividuallyFits = fetchedVideos.some(v => v.durationSeconds <= timeInfo.seconds);
                    if (fetchedVideos.length > 0 && !anyVideoIndividuallyFits) {
                         setError('検索されたすべての楽曲が、指定された合計所要時間よりも個別に長いため、プレイリストを作成できませんでした。所要時間を長くするか、キーワードを変更してください。');
                    } else {
                         setError('指定された時間枠に合うプレイリストを作成できませんでした。楽曲の組み合わせが見つからないか、適切な長さの楽曲が不足しています。キーワードや所要時間を変更してみてください。');
                    }
                }
            } else {
                 setError('キーワードに合う楽曲が見つかりませんでした。音楽カテゴリの動画のみを検索しています。');
            }
        } catch (err) {
            console.error("プレイリスト生成エラー:", err);
            setError(`プレイリスト生成中にエラーが発生しました: ${err.message}`);
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    };

    const playNextVideoRequest = useCallback(() => {
        const latestCurrentInfo = currentPlayingInfoRef.current;
        const latestPlaylist = generatedPlaylistRef.current;

        if (!latestCurrentInfo || !latestPlaylist || latestPlaylist.length === 0) {
            console.log("次の曲を再生できません (playNextVideoRequest): 情報またはプレイリストが不足しています。");
            setIsPlaying(false);
            setCurrentPlayingInfo(null); 
            return;
        }

        const nextIndex = latestCurrentInfo.index + 1;
        if (nextIndex < latestPlaylist.length) {
            const nextVideo = latestPlaylist[nextIndex];
            console.log(`次の曲をリクエスト (playNextVideoRequest): ${nextVideo.title}`);
            setCurrentPlayingInfo({ video: nextVideo, index: nextIndex }); 
        } else {
            console.log("プレイリストの最後に到達しました (playNextVideoRequest)。");
            setIsPlaying(false);
            setCurrentPlayingInfo(null); 
        }
    }, []); 

    const onPlayerStateChangeCallback = useCallback((event) => {
        const player = event.target;
        const videoData = player.getVideoData(); 
        const videoIdInPlayer = videoData?.video_id;
        const currentTrackedInfo = currentPlayingInfoRef.current;

        console.log(`プレーヤー状態変更: ${event.data}, PlayerVideoID: ${videoIdInPlayer || 'N/A'}, TrackedVideoID: ${currentTrackedInfo?.video?.id || 'N/A'}, Title: ${videoData?.title || 'N/A'}`);

        if (event.data === window.YT.PlayerState.ENDED) {
            if (currentTrackedInfo && videoIdInPlayer === currentTrackedInfo.video.id) {
                console.log(`ビデオ終了: ${videoData?.title}. 次の曲を再生します。`);
                playNextVideoRequest();
            } else {
                console.log(`ビデオ終了イベント受信 (ID: ${videoIdInPlayer}), しかし追跡中のビデオ (ID: ${currentTrackedInfo?.video?.id}) と一致しません。無視します。`);
            }
        } else if (event.data === window.YT.PlayerState.PLAYING) {
            setIsPlaying(true);
        } else if (event.data === window.YT.PlayerState.PAUSED) {
            setIsPlaying(false);
        } else if (event.data === window.YT.PlayerState.CUED) {
             console.log(`ビデオ読み込み完了 (CUED): ${videoData?.title}`);
        }
    }, [playNextVideoRequest]); 

    useEffect(() => {
        if (currentPlayingInfo && currentPlayingInfo.video && youtubeApiReady) {
            const { video } = currentPlayingInfo;
            console.log(`useEffect[currentPlayingInfo]: プレーヤーを準備/更新: ${video.title}`);

            if (playerRef.current) {
                playerRef.current.destroy(); 
                playerRef.current = null;
                console.log("既存プレーヤーを破棄 (useEffect)。");
            }
            
            console.log(`新規プレーヤーを作成 (useEffect): ${video.id}`);
            playerRef.current = new window.YT.Player('youtube-player-embed', {
                height: '100%',
                width: '100%',
                videoId: video.id,
                playerVars: {
                    autoplay: 1,
                    controls: 1, 
                    modestbranding: 1,
                    fs: 1,
                    origin: window.location.origin,
                },
                events: {
                    'onReady': (e) => {
                        console.log(`プレーヤー準備完了 (onReady for ${e.target.getVideoData()?.title}): 自動再生により再生開始のはず。`);
                    },
                    'onStateChange': onPlayerStateChangeCallback,
                    'onError': (e) => {
                        console.error("YouTubeプレーヤーエラー (useEffect):", e.data, "Video ID:", video?.id);
                        setError(`動画 (ID: ${video?.id}) の再生中にエラーが発生 (コード: ${e.data})。`);
                        setIsPlaying(false);
                    }
                }
            });
        } else if (!currentPlayingInfo && playerRef.current) {
            console.log("useEffect[currentPlayingInfo]: currentPlayingInfoがnullなのでプレーヤーを破棄します。");
            destroyPlayer();
        }
    }, [currentPlayingInfo, youtubeApiReady, onPlayerStateChangeCallback, destroyPlayer]);


    const handlePlayPause = () => {
        const latestPlaylist = generatedPlaylistRef.current;
        if (!latestPlaylist || latestPlaylist.length === 0 || !youtubeApiReady) return;

        if (isPlayingRef.current) {
            if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
                console.log("ビデオを一時停止します (handlePlayPause)。");
                playerRef.current.pauseVideo();
            }
        } else {
            const latestCurrentInfo = currentPlayingInfoRef.current;
            if (latestCurrentInfo && playerRef.current && typeof playerRef.current.playVideo === 'function' && playerRef.current.getPlayerState() === window.YT.PlayerState.PAUSED) {
                console.log("一時停止中のビデオを再生します (handlePlayPause)。");
                playerRef.current.playVideo();
            } else {
                const videoToStart = latestCurrentInfo ? latestCurrentInfo.video : latestPlaylist[0];
                const indexToStart = latestCurrentInfo ? latestCurrentInfo.index : 0;
                if (videoToStart) {
                    console.log(`プレイリストの再生を開始/再開します (handlePlayPause): ${videoToStart.title}`);
                    setCurrentPlayingInfo({ video: videoToStart, index: indexToStart }); 
                }
            }
        }
    };

    const handleSkipNext = () => {
        if (currentPlayingInfoRef.current) { 
             playNextVideoRequest();
        }
    };
    
    const handlePlaySpecificSong = (video, index) => {
        if (youtubeApiReady) {
            console.log(`リストアイテムクリック: ${video.title}`);
            setCurrentPlayingInfo({ video, index }); 
        } else {
            setError("YouTube Player APIが準備できていません。");
        }
    };

    const handleOpenSaveModal = () => {
        if (generatedPlaylist.length === 0) {
            setError("保存するプレイリストがありません。");
            return;
        }
        const defaultName = musicKeywords && travelTimeInfo 
            ? `${musicKeywords} (${travelTimeInfo.text})` 
            : `プレイリスト ${new Date().toLocaleString()}`;
        
        const loadedPlaylist = savedPlaylists.find(p => p.id === currentPlaylistId);
        setPlaylistName(loadedPlaylist ? loadedPlaylist.name : defaultName);
        setShowSaveModal(true);
    };

    const handleSavePlaylist = async () => {
        if (!dbPromise) {
            setError("データベース接続が初期化されていません。");
            return;
        }
        if (generatedPlaylist.length === 0) {
            setError("保存するプレイリストがありません。");
            setShowSaveModal(false);
            return;
        }
        if (!playlistName.trim()) {
            setError("プレイリスト名を入力してください。");
            return;
        }

        setIsLoading(true);
        setLoadingMessage("プレイリストを保存中...");

        const newPlaylistData = {
            id: currentPlaylistId || Date.now().toString(), 
            name: playlistName.trim(),
            videos: generatedPlaylist,
            totalDuration: playlistTotalDuration,
            targetDuration: travelTimeInfo?.seconds || 0,
            keywords: musicKeywords,
            createdAt: new Date().toISOString(), 
            originalTargetText: travelTimeInfo?.text || '',
            // theme: suggestedTheme || '', // Gemini API 関連のテーマは削除
        };

        try {
            const db = await dbPromise;
            const tx = db.transaction(STORE_NAME_PLAYLISTS, 'readwrite');
            const store = tx.objectStore(STORE_NAME_PLAYLISTS);
            await store.put(newPlaylistData);
            await tx.done;
            
            await loadAndSortPlaylists(); 
            
            if (!currentPlaylistId) {
                setCurrentPlaylistId(newPlaylistData.id);
            }
            
            setShowSaveModal(false);
            setError(''); 
        } catch (e) {
            console.error("Error saving playlist to IndexedDB: ", e);
            setError(`プレイリストの保存に失敗しました: ${e.message}`);
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    };
    
    const handleLoadPlaylist = (playlistToLoad) => {
        setGeneratedPlaylist(playlistToLoad.videos);
        setPlaylistTotalDuration(playlistToLoad.totalDuration);
        setMusicKeywords(playlistToLoad.keywords || '');
        setTravelTimeInfo({
            text: playlistToLoad.originalTargetText || formatDuration(playlistToLoad.targetDuration),
            seconds: playlistToLoad.targetDuration,
        });
        setCurrentPlaylistId(playlistToLoad.id); 
        // setSuggestedTheme(playlistToLoad.theme || ''); // Gemini API 関連のテーマは削除
        setCurrentPlayingInfo(null); 
        destroyPlayer();
        setShowSavedPlaylistsPanel(false); 
        setError('');
    };

    const handleDeletePlaylist = async (playlistIdToDelete) => {
        if (!dbPromise) {
            setError("データベース接続が初期化されていません。");
            return;
        }
        if (!window.confirm("このプレイリストを削除してもよろしいですか？この操作は元に戻せません。")) {
            return;
        }

        setIsLoading(true);
        setLoadingMessage("プレイリストを削除中...");
        try {
            const db = await dbPromise;
            const tx = db.transaction(STORE_NAME_PLAYLISTS, 'readwrite');
            const store = tx.objectStore(STORE_NAME_PLAYLISTS);
            await store.delete(playlistIdToDelete);
            await tx.done;
            
            await loadAndSortPlaylists(); 
            
            console.log("Playlist deleted with ID: ", playlistIdToDelete);
            if (currentPlaylistId === playlistIdToDelete) {
                setCurrentPlaylistId(null); 
                setGeneratedPlaylist([]);
                setPlaylistTotalDuration(0);
                setTravelTimeInfo(null);
                setMusicKeywords('');
                // setSuggestedTheme(''); // Gemini API 関連のテーマは削除
            }
        } catch (e) {
            console.error("Error deleting playlist from IndexedDB: ", e);
            setError(`プレイリストの削除に失敗しました: ${e.message}`);
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    };

    const handleSortChange = (criteria) => {
        if (sortCriteria === criteria) {
            setSortOrder(prevOrder => prevOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortCriteria(criteria);
            setSortOrder('asc'); 
            if (criteria === 'createdAt') setSortOrder('desc');
        }
    };


    const renderApiKeyModal = () => (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 sm:p-8 rounded-lg shadow-xl w-full max-w-md">
                <div className="flex items-center mb-4">
                    <Key size={24} className="text-blue-600 mr-2" />
                    <h2 className="text-xl sm:text-2xl font-semibold text-gray-800">APIキー設定</h2>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                    このアプリを使用するには、YouTube Data API v3キーが必要です。
                    このキーはブラウザのローカルストレージに保存されます。
                </p>
                <div className="mb-6">
                    <label htmlFor="youtubeApiKeyInput" className="block text-sm font-medium text-gray-700 mb-1">YouTube Data APIキー</label>
                    <input
                        type="password"
                        id="youtubeApiKeyInput"
                        value={tempYoutubeApiKey}
                        onChange={(e) => setTempYoutubeApiKey(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        placeholder="YouTube Data APIキーを入力"
                    />
                </div>
                {error && showApiKeyModal && <p className="text-red-500 text-sm mb-4">{error}</p>}
                <button
                    onClick={handleApiKeySubmit}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md shadow-md transition duration-150 flex items-center justify-center"
                >
                    <Key size={18} className="mr-2"/> キーを設定して開始
                </button>
                 <p className="text-xs text-gray-500 mt-4">
                    <AlertTriangle size={14} className="inline mr-1" /> APIキーはローカルストレージに保存されます。公共のコンピュータでの使用は推奨しません。
                </p>
            </div>
        </div>
    );

    const renderSavePlaylistModal = () => (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 sm:p-8 rounded-lg shadow-xl w-full max-w-md text-gray-800">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl sm:text-2xl font-semibold">プレイリストを保存</h2>
                    <button onClick={() => setShowSaveModal(false)} className="text-gray-500 hover:text-gray-700">
                        <XCircle size={24} />
                    </button>
                </div>
                <div className="mb-4">
                    <label htmlFor="playlistName" className="block text-sm font-medium text-gray-700 mb-1">プレイリスト名</label>
                    <input
                        type="text"
                        id="playlistName"
                        value={playlistName}
                        onChange={(e) => setPlaylistName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        placeholder="プレイリスト名を入力"
                    />
                </div>
                {/* Gemini API 関連のテーマ表示は削除 */}
                {error && showSaveModal && <p className="text-red-500 text-sm mb-4">{error}</p>}
                <div className="flex space-x-2">
                    <button
                        onClick={handleSavePlaylist}
                        disabled={isLoading}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md shadow-md transition duration-150 flex items-center justify-center disabled:opacity-50"
                    >
                        {isLoading ? <Loader2 size={18} className="animate-spin mr-2"/> : <Save size={18} className="mr-2"/>}
                        {currentPlaylistId && savedPlaylists.some(p => p.id === currentPlaylistId) ? '更新' : '保存'}
                    </button>
                    <button
                        onClick={() => setShowSaveModal(false)}
                        className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-md shadow-md transition duration-150"
                    >
                        キャンセル
                    </button>
                </div>
            </div>
        </div>
    );

    const renderSortButton = (criteria, label, Icon) => {
        const isActive = sortCriteria === criteria;
        const currentOrderIcon = isActive && sortOrder === 'asc' ? <ArrowUpAZ size={14} className="ml-1"/> : <ArrowDownAZ size={14} className="ml-1"/>;
        return (
            <button
                onClick={() => handleSortChange(criteria)}
                className={`flex items-center text-xs px-2 py-1 rounded-md transition-colors
                            ${isActive ? 'bg-blue-500 text-white' : 'bg-slate-600 hover:bg-slate-500 text-gray-300'}`}
                title={`Sort by ${label} (${isActive ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'ascending'})`}
            >
                <Icon size={14} className="mr-1" /> {label} {isActive && currentOrderIcon}
            </button>
        );
    };

    const renderSavedPlaylistsPanel = () => (
        <div className={`fixed top-0 ${showSavedPlaylistsPanel ? 'left-0' : '-left-full sm:-left-80'} w-full sm:w-80 h-full bg-slate-800 shadow-xl z-40 transition-all duration-300 ease-in-out p-4 flex flex-col`}>
            <div className="flex justify-between items-center mb-2">
                <h2 className="text-xl font-semibold text-blue-300">保存済みリスト</h2>
                <button onClick={() => setShowSavedPlaylistsPanel(false)} className="text-gray-400 hover:text-white">
                    <PanelLeftClose size={24} />
                </button>
            </div>
            <div className="flex space-x-1 mb-3 overflow-x-auto pb-1">
                {renderSortButton('createdAt', '作成日', Clock2)}
                {renderSortButton('name', '名前', ArrowDownAZ)}
                {renderSortButton('videoCount', '曲数', ListOrdered)}
                {renderSortButton('totalDuration', '再生時間', Timer)}
            </div>
            {savedPlaylists.length === 0 && (
                <p className="text-gray-400 text-sm">保存されたプレイリストはありません。</p>
            )}
            <ul className="space-y-2 overflow-y-auto flex-grow">
                {savedPlaylists.map(p => (
                    <li key={p.id} className="p-3 bg-slate-700 rounded-md hover:bg-slate-600/70 transition-colors group">
                        <div className="flex justify-between items-start">
                            <div>
                                <button onClick={() => handleLoadPlaylist(p)} className="text-sm font-medium text-blue-300 hover:text-blue-200 text-left block">
                                    {p.name}
                                </button>
                                {/* p.theme の表示は削除 */}
                                <p className="text-xs text-gray-400">
                                    {p.videoCount}曲 / {formatDuration(p.totalDuration)}
                                </p>
                                <p className="text-xs text-gray-500">
                                    作成日: {p.createdAt.toLocaleDateString()}
                                </p>
                            </div>
                            <button 
                                onClick={() => handleDeletePlaylist(p.id)} 
                                className="text-red-500 hover:text-red-400 opacity-50 group-hover:opacity-100 transition-opacity p-1"
                                title="削除"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );


    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-gray-100 font-sans p-4 sm:p-6 flex flex-col items-center relative">
            {showApiKeyModal && renderApiKeyModal()}
            {showSaveModal && renderSavePlaylistModal()}
            {renderSavedPlaylistsPanel()}

            <button 
                onClick={() => setShowSavedPlaylistsPanel(true)}
                className="fixed top-4 left-4 z-30 p-2 bg-slate-700 hover:bg-slate-600 rounded-md shadow-lg text-blue-300 disabled:opacity-50"
                title="保存済みリストを開く"
                disabled={!isApiKeySet}
            >
                <PanelLeftOpen size={24} />
            </button>

            <header className="w-full max-w-3xl mb-6 text-center mt-12 sm:mt-0">
                <div className="flex items-center justify-center mb-2">
                    <ListMusic size={36} className="text-blue-400 mr-3"/>
                    <h1 className="text-3xl sm:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300">
                        移動時間ぴったりプレイリスト
                    </h1>
                </div>
                <p className="text-sm text-gray-400">入力された移動時間に合わせたYouTube音楽プレイリストを自動生成します。</p>
            </header>

            {!isApiKeySet && !showApiKeyModal && (
                 <div className="w-full max-w-md bg-slate-800 p-6 rounded-lg shadow-xl text-center">
                    <AlertTriangle size={32} className="text-yellow-400 mx-auto mb-3"/>
                    <p className="text-lg font-semibold mb-2">APIキーが必要です</p>
                    <p className="text-sm text-gray-300 mb-4">
                        アプリを動作させるにはAPIキーの設定が必要です。
                    </p>
                    <button
                        onClick={() => { setError(''); setShowApiKeyModal(true);}}
                        className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-md shadow transition duration-150"
                    >
                        APIキーを設定
                    </button>
                </div>
            )}

            {isApiKeySet && (
                <main className="w-full max-w-3xl space-y-6">
                    <section className="bg-slate-800 p-5 rounded-xl shadow-2xl">
                        <h2 className="text-xl font-semibold mb-4 text-blue-300 flex items-center"><Timer size={20} className="mr-2"/>入力情報</h2>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="travelTime" className="block text-sm font-medium text-gray-300 mb-1">移動の所要時間</label>
                                <div className="flex space-x-2 items-center">
                                    <input
                                        type="number"
                                        min="0"
                                        value={manualHours}
                                        onChange={(e) => setManualHours(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 placeholder-gray-500"
                                        placeholder="時間 (例: 1)"
                                    />
                                    <span className="text-gray-400">時間</span>
                                    <input
                                        type="number"
                                        min="0"
                                        max="59"
                                        value={manualMinutes}
                                        onChange={(e) => setManualMinutes(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 placeholder-gray-500"
                                        placeholder="分 (例: 30)"
                                    />
                                    <span className="text-gray-400">分</span>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label htmlFor="musicKeywords" className="block text-sm font-medium text-gray-300">音楽キーワード</label>
                                    {/* Gemini API 関連キーワード提案ボタンは削除 */}
                                </div>
                                <input
                                    type="text"
                                    id="musicKeywords"
                                    value={musicKeywords}
                                    onChange={(e) => setMusicKeywords(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 placeholder-gray-500"
                                    placeholder="例: J-POP, 好きなアーティスト名, 作業用BGM"
                                />
                                {/* Gemini API 関連キーワード表示は削除 */}
                            </div>
                            <button
                                onClick={handleGeneratePlaylist}
                                disabled={isLoading || (!manualHours && !manualMinutes) || !musicKeywords}
                                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold py-3 px-4 rounded-md shadow-lg transition duration-150 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? <Loader2 size={20} className="animate-spin mr-2"/> : <Search size={20} className="mr-2"/>}
                                {isLoading ? loadingMessage : "プレイリスト生成"}
                            </button>
                        </div>
                    </section>

                    {/* Gemini API エラー表示は削除 */}
                    {error && !isLoading && (
                        <div className="bg-red-700 bg-opacity-80 p-4 rounded-lg shadow-md flex items-start">
                            <AlertTriangle size={24} className="text-red-300 mr-3 flex-shrink-0" />
                            <p className="text-sm text-red-200">{error}</p>
                        </div>
                    )}
                    
                    <div id="youtube-player-container" className={`my-4 ${currentPlayingInfo ? 'block' : 'hidden'}`}>
                         <div id="youtube-player-embed" className="w-full aspect-video rounded-lg shadow-xl overflow-hidden bg-black"></div>
                         {currentPlayingInfo && (
                            <p className="text-center text-sm text-gray-400 mt-2">
                               再生中: <span className="font-semibold text-gray-200">{currentPlayingInfo.video.title}</span>
                            </p>
                         )}
                    </div>

                    {(travelTimeInfo || generatedPlaylist.length > 0) && !isLoading && !error && (
                        <section className="bg-slate-800 p-5 rounded-xl shadow-2xl">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-semibold text-green-300 flex items-center"><Youtube size={20} className="mr-2"/>生成結果</h2>
                                <div className="flex items-center space-x-2">
                                    {/* Gemini API テーマ提案ボタンは削除 */}
                                    {generatedPlaylist.length > 0 && ( 
                                        <button
                                            onClick={handleOpenSaveModal}
                                            title={currentPlaylistId && savedPlaylists.some(p => p.id === currentPlaylistId) ? "プレイリストを更新" : "プレイリストを保存"}
                                            className="p-2 bg-purple-500 hover:bg-purple-600 text-white rounded-full shadow-md transition-colors"
                                        >
                                            <Save size={20} />
                                        </button>
                                    )}
                                    {generatedPlaylist.length > 0 && youtubeApiReady && (
                                        <>
                                            <button
                                                onClick={handlePlayPause}
                                                title={isPlaying ? "一時停止" : "プレイリスト再生"}
                                                className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-full shadow-md transition-colors"
                                            >
                                                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                                            </button>
                                            <button
                                                onClick={handleSkipNext}
                                                title="次の曲へ"
                                                disabled={!currentPlayingInfoRef.current || currentPlayingInfoRef.current.index >= generatedPlaylistRef.current.length -1}
                                                className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <SkipForward size={20} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                            {/* Gemini API テーマ表示は削除 */}
                            {travelTimeInfo && (
                                <div className="mb-4 p-3 bg-slate-700 rounded-md">
                                    <p className="text-sm text-gray-300 flex items-center">
                                        <Clock size={16} className="mr-2 text-blue-400"/>入力された所要時間:
                                        <span className="font-semibold text-lg ml-2 text-white">{travelTimeInfo.text}</span>
                                        <span className="text-xs ml-1 text-gray-400">({formatDuration(travelTimeInfo.seconds)})</span>
                                    </p>
                                </div>
                            )}

                            {generatedPlaylist.length > 0 ? (
                                <div>
                                    <div className="mb-3 p-3 bg-slate-700 rounded-md">
                                        <p className="text-sm text-gray-300 flex items-center">
                                            <ListMusic size={16} className="mr-2 text-green-400"/>
                                            {currentPlaylistId && savedPlaylists.find(p => p.id === currentPlaylistId) ? `読み込み済み: ${savedPlaylists.find(p => p.id === currentPlaylistId).name}` : '現在のプレイリスト'}
                                            <span className="font-semibold text-lg ml-2 text-white">{formatDuration(playlistTotalDuration)}</span>
                                        </p>
                                        {travelTimeInfo && playlistTotalDuration < travelTimeInfo.seconds && playlistTotalDuration > 0 && (
                                            <p className="text-xs text-yellow-400 mt-1">
                                                <AlertTriangle size={12} className="inline mr-1"/>目標時間より短いですが、これが最適な組み合わせです。
                                            </p>
                                        )}
                                    </div>
                                    <ul className="space-y-3 max-h-[40vh] overflow-y-auto pr-2">
                                        {generatedPlaylist.map((video, index) => (
                                            <li 
                                                key={`${video.id}-${index}`} 
                                                className={`flex items-start p-3 rounded-lg transition-all duration-200 shadow cursor-pointer
                                                            ${currentPlayingInfo?.video.id === video.id && currentPlayingInfo?.index === index ? 'bg-blue-600 scale-105' : 'bg-slate-700 hover:bg-slate-600/70'}`}
                                                onClick={() => handlePlaySpecificSong(video, index)}
                                            >
                                                <img src={video.thumbnailUrl} alt={video.title} className="w-20 h-auto rounded-md mr-3 object-cover"/>
                                                <div className="flex-grow">
                                                    <span                                                       
                                                        className={`text-sm font-medium ${currentPlayingInfo?.video.id === video.id && currentPlayingInfo?.index === index ? 'text-white' : 'text-blue-300'}`}
                                                    >
                                                        {video.title}
                                                    </span>
                                                    <p className={`text-xs mt-1 ${currentPlayingInfo?.video.id === video.id && currentPlayingInfo?.index === index ? 'text-blue-200' : 'text-gray-400'}`}>{video.channelTitle}</p>
                                                </div>
                                                <p className={`text-sm ml-2 whitespace-nowrap ${currentPlayingInfo?.video.id === video.id && currentPlayingInfo?.index === index ? 'text-blue-100' : 'text-gray-300'}`}>{formatDuration(video.durationSeconds)}</p>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                travelTimeInfo && <p className="text-center text-gray-400 py-4">プレイリストを生成できませんでした。上記のメッセージを確認してください。</p>
                            )}
                        </section>
                    )}
                     {!isLoading && !travelTimeInfo && isApiKeySet && !error && (
                        <section className="bg-slate-800 p-5 rounded-xl shadow-2xl text-center">
                            <p className="text-gray-400">所要時間と音楽キーワードを入力して、「プレイリスト生成」ボタンを押してください。</p>
                        </section>
                    )}
                </main>
            )}
             <footer className="w-full max-w-3xl mt-8 text-center text-xs text-gray-500">
                <p>
                    <AlertTriangle size={14} className="inline mr-1" /> 
                    APIキーはブラウザのローカルストレージに保存されます。公共のコンピュータでの使用は推奨しません。
                    APIの利用規約と割り当て制限にご注意ください。
                </p>
                <p className="mt-1">
                    © {new Date().getFullYear()} Perfect Playlist Generator. All rights reserved.
                </p>
            </footer>
        </div>
    );
};

export default App;
