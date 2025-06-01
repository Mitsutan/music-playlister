import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Clock, Youtube, Key, AlertTriangle, ListMusic, Loader2, Timer, Play, Pause, SkipForward } from 'lucide-react'; // Removed ExternalLink
import './App.css';

// Helper function to parse ISO 8601 duration
const parseISO8601Duration = (durationString) => {
    if (!durationString) return 0;
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = durationString.match(regex);
    if (!matches) return 0;
    const hours = parseInt(matches[1] || '0');
    const minutes = parseInt(matches[2] || '0');
    const seconds = parseInt(matches[3] || '0');
    return hours * 3600 + minutes * 60 + seconds;
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

// Main App Component
const App = () => {
    const [youtubeApiKey, setYoutubeApiKey] = useState('');
    const [isApiKeySet, setIsApiKeySet] = useState(false);
    const [tempYoutubeApiKey, setTempYoutubeApiKey] = useState('');

    const [manualHours, setManualHours] = useState('');
    const [manualMinutes, setManualMinutes] = useState('');
    const [musicKeywords, setMusicKeywords] = useState('');
    
    const [travelTimeInfo, setTravelTimeInfo] = useState(null);
    const [generatedPlaylist, setGeneratedPlaylist] = useState([]);
    const [playlistTotalDuration, setPlaylistTotalDuration] = useState(0);

    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState('');
    const [showApiKeyModal, setShowApiKeyModal] = useState(true);

    const [youtubeApiReady, setYoutubeApiReady] = useState(false);
    const playerRef = useRef(null);
    const [currentPlayingInfo, setCurrentPlayingInfo] = useState(null); // { video, index }
    const [isPlaying, setIsPlaying] = useState(false);

    // Refs for state/props needed in callbacks that might be stale otherwise
    const currentPlayingInfoRef = useRef(currentPlayingInfo);
    useEffect(() => { currentPlayingInfoRef.current = currentPlayingInfo; }, [currentPlayingInfo]);

    const generatedPlaylistRef = useRef(generatedPlaylist);
    useEffect(() => { generatedPlaylistRef.current = generatedPlaylist; }, [generatedPlaylist]);

    const isPlayingRef = useRef(isPlaying);
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);


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

            if (bestDurationOverall === targetDurationInSeconds) {
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


    const renderApiKeyModal = () => (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 sm:p-8 rounded-lg shadow-xl w-full max-w-md">
                <div className="flex items-center mb-4">
                    <Key size={24} className="text-blue-600 mr-2" />
                    <h2 className="text-xl sm:text-2xl font-semibold text-gray-800">APIキー設定</h2>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                    このアプリを使用するには、YouTube Data API v3キーが必要です。
                    このキーはブラウザに保存されず、このセッションでのみ使用されます。
                </p>
                <div className="mb-6">
                    <label htmlFor="youtubeApiKey" className="block text-sm font-medium text-gray-700 mb-1">YouTube Data APIキー</label>
                    <input
                        type="password"
                        id="youtubeApiKey"
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
                    <AlertTriangle size={14} className="inline mr-1" /> APIキーは外部に送信されませんが、クライアントサイドで処理されるため、開発者ツールなどで確認可能です。公共のコンピュータでの使用は推奨しません。
                </p>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-gray-100 font-sans p-4 sm:p-6 flex flex-col items-center">
            {showApiKeyModal && renderApiKeyModal()}

            <header className="w-full max-w-3xl mb-6 text-center">
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
                                <label htmlFor="musicKeywords" className="block text-sm font-medium text-gray-300 mb-1">音楽キーワード</label>
                                <input
                                    type="text"
                                    id="musicKeywords"
                                    value={musicKeywords}
                                    onChange={(e) => setMusicKeywords(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 placeholder-gray-500"
                                    placeholder="例: J-POP, 好きなアーティスト名, 作業用BGM"
                                />
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
                                {generatedPlaylist.length > 0 && youtubeApiReady && (
                                    <div className="flex items-center space-x-2">
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
                                    </div>
                                )}
                            </div>
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
                                            <ListMusic size={16} className="mr-2 text-green-400"/>生成されたプレイリストの総再生時間:
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
                                                key={video.id} 
                                                className={`flex items-start p-3 rounded-lg transition-all duration-200 shadow cursor-pointer
                                                            ${currentPlayingInfo?.video.id === video.id ? 'bg-blue-600 scale-105' : 'bg-slate-700 hover:bg-slate-600/70'}`}
                                                onClick={() => handlePlaySpecificSong(video, index)}
                                            >
                                                <img src={video.thumbnailUrl} alt={video.title} className="w-20 h-auto rounded-md mr-3 object-cover"/>
                                                <div className="flex-grow">
                                                    <a  // Changed back to <a> tag for external link icon if needed in future
                                                        href={`https://www.youtube.com/watch?v=${video.id}`} // This link might not be directly playable depending on context
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()} // Prevent li's onClick when clicking link
                                                        className={`text-sm font-medium ${currentPlayingInfo?.video.id === video.id ? 'text-white hover:text-blue-200' : 'text-blue-300 hover:text-blue-200'}`}
                                                    >
                                                        {video.title}
                                                        {/* <ExternalLink size={12} className="inline ml-1 opacity-70" /> */} {/* Example if ExternalLink were used */}
                                                    </a>
                                                    <p className={`text-xs mt-1 ${currentPlayingInfo?.video.id === video.id ? 'text-blue-200' : 'text-gray-400'}`}>{video.channelTitle}</p>
                                                </div>
                                                <p className={`text-sm ml-2 whitespace-nowrap ${currentPlayingInfo?.video.id === video.id ? 'text-blue-100' : 'text-gray-300'}`}>{formatDuration(video.durationSeconds)}</p>
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
                    APIキーはブラウザの外部には送信されませんが、クライアントサイドで処理されるため、開発者ツールなどで閲覧可能です。公共のコンピュータでの使用は推奨しません。
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

