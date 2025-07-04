// DOM元素
const audioPlayer = document.getElementById('audio-player');
const videoPlayer = document.getElementById('video-player');
const playBtn = document.getElementById('play-btn');
const pauseBtn = document.getElementById('pause-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const progressBar = document.getElementById('progress-bar');
const progress = document.getElementById('progress');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');
const fsCurrentTimeEl = document.getElementById('fs-current-time');
const fsTotalTimeEl = document.getElementById('fs-total-time');
const currentTrackEl = document.getElementById('current-track');
const videoContainer = document.getElementById('video-container');
const fileList = document.getElementById('file-list');
const historyList = document.getElementById('history-list');
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const speedSelect = document.getElementById('speed-select');
const fsSpeedSelect = document.getElementById('fs-speed-select');
const renameModal = document.getElementById('rename-modal');
const oldFilenameSpan = document.getElementById('old-filename');
const newFilenameInput = document.getElementById('new-filename');
const renameCancel = document.getElementById('rename-cancel');
const renameConfirm = document.getElementById('rename-confirm');
const muteBtn = document.getElementById('mute-btn');
const volumeSlider = document.getElementById('volume-slider');
const fsMuteBtn = document.getElementById('fs-mute-btn');
const fsVolumeSlider = document.getElementById('fs-volume-slider');

// 全局变量
let currentFile = null;
let currentMediaType = null;
let mediaFiles = [];
let isFullscreen = false;
let hideControlsTimeout;
let renameContext = {
    filename: null,
    isHistory: false
};

// 初始化媒体文件
function initMediaFiles() {
    mediaFiles = Array.from(document.querySelectorAll('.file-item')).map(item => {
        return {
            name: item.dataset.filename,
            element: item,
            type: item.classList.contains('video-file') ? 'video' : 'audio'
        };
    });
}

// 播放文件
function playFile(filename) {
    // 清理特殊字符并提取纯文件名
    const displayName = decodeURIComponent(filename.split('/').pop());
    
    fetch('/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `filename=${encodeURIComponent(filename)}`
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    })
    .then(data => {
        if (data.status !== 'success') throw new Error(data.message || 'Unknown error');
        
        // 更新全局状态
        currentFile = filename;
        currentMediaType = data.media_type;
        currentTrackEl.textContent = displayName;  // 使用处理后的显示名
        
        // 预加载首帧（视频专用）
        if (currentMediaType === 'video') {
            videoContainer.style.display = 'block';
            videoPlayer.preload = 'auto';  // 启用预加载[1](@ref)
            videoPlayer.src = data.filepath + '?t=' + Date.now(); // 防缓存
            videoPlayer.load();
            
            // 首帧加载后自动暂停（确保首帧就绪）
            videoPlayer.addEventListener('loadeddata', () => {
                videoPlayer.pause();
                videoPlayer.currentTime = 0;
            }, { once: true });
            
            videoPlayer.play().catch(e => {
                console.error('Video play failed:', e);
                alert(`视频播放失败: ${e.message}`);
            });
            
            // 更安全地暂停音频（检查是否正在播放）
            if (!audioPlayer.paused) audioPlayer.pause();
        } 
        // 音频处理
        else {
            videoContainer.style.display = 'none';
            audioPlayer.src = data.filepath + '?t=' + Date.now();
            audioPlayer.load();
            audioPlayer.play().catch(e => {
                console.error('Audio play failed:', e);
                alert(`音频播放失败: ${e.message}`);
            });
            
            // 重置视频状态
            videoPlayer.pause();
            videoPlayer.currentTime = 0;
            videoPlayer.removeAttribute('src'); // 释放资源
        }
        
        updatePlayButton(true);
        setPlaybackSpeed(1.0);
    })
    .catch(error => {
        console.error('Playback error:', error);
        currentTrackEl.textContent = `播放失败: ${displayName}`;
        updatePlayButton(false);
    });
}

// 初始化全屏控制
function initFullscreenControls() {
    const fsPlayBtn = document.getElementById('fs-play-btn');
    const fsPauseBtn = document.getElementById('fs-pause-btn');
    const fsFullscreenBtn = document.getElementById('fs-fullscreen-btn');
    
    fsPlayBtn.addEventListener('click', () => {
        videoPlayer.play();
        updatePlayButton(true);
        updateFullscreenPlayButton(true);
    });
    
    fsPauseBtn.addEventListener('click', () => {
        videoPlayer.pause();
        updatePlayButton(false);
        updateFullscreenPlayButton(false);
    });
    
    fsFullscreenBtn.addEventListener('click', () => {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        }
    });
    
    // 全屏倍速控制
    fsSpeedSelect.addEventListener('change', (e) => {
        const speed = parseFloat(e.target.value);
        setPlaybackSpeed(speed);
    });
    
    // 更新全屏控制栏的播放按钮状态
    updateFullscreenPlayButton(!videoPlayer.paused);
    
    // 全屏静音按钮事件
    fsMuteBtn.addEventListener('click', toggleMute);
    
    // 全屏音量滑块事件
    fsVolumeSlider.addEventListener('input', (e) => {
        const volume = parseFloat(e.target.value);
        setVolume(volume);
        updateVolumeUI(volume);
    });
}

function updateFullscreenPlayButton(isPlaying) {
    const fsPlayBtn = document.getElementById('fs-play-btn');
    const fsPauseBtn = document.getElementById('fs-pause-btn');
    
    if (isPlaying) {
        fsPlayBtn.style.display = 'none';
        fsPauseBtn.style.display = 'flex';
    } else {
        fsPlayBtn.style.display = 'flex';
        fsPauseBtn.style.display = 'none';
    }
}

// 更新播放按钮状态
function updatePlayButton(isPlaying) {
    if (isPlaying) {
        playBtn.style.display = 'none';
        pauseBtn.style.display = 'flex';
    } else {
        playBtn.style.display = 'flex';
        pauseBtn.style.display = 'none';
    }
}

// 获取当前播放器
function getCurrentPlayer() {
    return currentMediaType === 'video' ? videoPlayer : audioPlayer;
}

// 更新进度条
function updateProgress() {
    const player = getCurrentPlayer();
    const percent = (player.currentTime / player.duration) * 100;
    progress.style.width = `${percent}%`;
    
    // 更新时间显示
    const currentTime = formatTime(player.currentTime);
    const totalTime = formatTime(player.duration);
    
    currentTimeEl.textContent = currentTime;
    totalTimeEl.textContent = totalTime;
    
    // 更新全屏时间显示
    if (isFullscreen && currentMediaType === 'video') {
        const fsProgress = document.getElementById('fullscreen-progress');
        if (fsProgress) {
            fsProgress.style.width = `${percent}%`;
        }
        
        fsCurrentTimeEl.textContent = currentTime;
        fsTotalTimeEl.textContent = totalTime;
    }
}

// 格式化时间 (秒 -> MM:SS)
function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

// 设置播放位置
function setProgress(e) {
    const width = this.clientWidth;
    const clickX = e.offsetX;
    const player = getCurrentPlayer();
    
    if (player.duration) {
        player.currentTime = (clickX / width) * player.duration;
    }
}

// 更新播放位置到数据库
function updatePosition() {
    if (currentFile) {
        const player = getCurrentPlayer();
        fetch('/update_position', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `filename=${encodeURIComponent(currentFile)}&position=${player.currentTime}`
        });
    }
}

// 切换全屏
function toggleFullscreen() {
    if (currentMediaType === 'video') {
        if (!document.fullscreenElement) {
            if (videoContainer.requestFullscreen) {
                videoContainer.requestFullscreen();
                isFullscreen = true;
                showFullscreenControls();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
                isFullscreen = false;
            }
        }
    }
}

// 显示全屏控制栏
function showFullscreenControls() {
    const fullscreenControls = document.getElementById('fullscreen-controls');
    if (fullscreenControls) {
        fullscreenControls.style.display = 'flex';
        
        // 设置3秒后自动隐藏控制栏
        clearTimeout(hideControlsTimeout);
        hideControlsTimeout = setTimeout(() => {
            fullscreenControls.style.display = 'none';
        }, 3000);
    }
}

// 设置播放速度
function setPlaybackSpeed(speed) {
    const player = getCurrentPlayer();
    player.playbackRate = speed;
    
    // 更新UI
    if (speedSelect) speedSelect.value = speed;
    if (fsSpeedSelect) fsSpeedSelect.value = speed;
}

// 切换静音
function toggleMute() {
    const player = getCurrentPlayer();
    player.muted = !player.muted;
    updateMuteUI(player.muted);
}

// 设置音量
function setVolume(volume) {
    const player = getCurrentPlayer();
    player.volume = volume;
    player.muted = volume === 0;
    updateVolumeUI(volume);
    updateMuteUI(player.muted);
}

// 更新静音按钮UI
function updateMuteUI(isMuted) {
    if (isMuted) {
        muteBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
        fsMuteBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
    } else {
        muteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        fsMuteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
    }
}

// 更新音量滑块UI
function updateVolumeUI(volume) {
    volumeSlider.value = volume;
    fsVolumeSlider.value = volume;
    
    if (volume === 0) {
        muteBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
        fsMuteBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
    } else if (volume < 0.5) {
        muteBtn.innerHTML = '<i class="fas fa-volume-down"></i>';
        fsMuteBtn.innerHTML = '<i class="fas fa-volume-down"></i>';
    } else {
        muteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        fsMuteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
    }
}

// 删除文件
function deleteFile(filename, isHistory = false) {
    if (confirm(`确定要${isHistory ? '删除历史记录' : '删除文件'} "${filename}" 吗？`)) {
        fetch('/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `filename=${encodeURIComponent(filename)}&is_history=${isHistory}`
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                // 从UI中移除项目
                const itemToRemove = document.querySelector(`[data-filename="${filename}"]`);
                if (itemToRemove) {
                    itemToRemove.remove();
                }
                
                // 如果删除的是当前播放的文件，停止播放
                if (filename === currentFile) {
                    const player = getCurrentPlayer();
                    player.pause();
                    currentFile = null;
                    currentMediaType = null;
                    currentTrackEl.textContent = "请选择媒体文件";
                    updatePlayButton(false);
                }
                
                // 更新媒体文件列表
                initMediaFiles();
            } else {
                alert('删除失败: ' + data.message);
            }
        });
    }
}

// 重命名文件
function renameFile(filename, isHistory = false) {
    renameContext.filename = filename;
    renameContext.isHistory = isHistory;
    
    // 显示模态框
    oldFilenameSpan.textContent = filename;
    newFilenameInput.value = filename;
    renameModal.style.display = 'flex';
    newFilenameInput.focus();
}

// 确认重命名
function confirmRename() {
    const oldFilename = renameContext.filename;
    const newFilename = newFilenameInput.value.trim();
    
    if (!newFilename) {
        alert('请输入新文件名');
        return;
    }
    
    if (newFilename === oldFilename) {
        renameModal.style.display = 'none';
        return;
    }
    
    fetch('/rename', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `old_filename=${encodeURIComponent(oldFilename)}&new_filename=${encodeURIComponent(newFilename)}&is_history=${renameContext.isHistory}`
    })
    .then(response => {
        if (!response.ok) throw new Error("网络错误");
        return response.json();
    })
    .then(data => {
        if (data.status === 'success') {
            // 增强版UI更新函数
            updateFileUI(oldFilename, data.new_filename || newFilename, data.file_path);
            renameModal.style.display = 'none';
        } else {
            throw new Error(data.message || "未知错误");
        }
    })
    .catch(error => {
        console.error("重命名失败:", error);
        alert(`操作失败: ${error.message}`);
    });
}

// 增强的UI更新函数（处理所有可能显示文件名的元素）
function updateFileUI(oldName, newName, newPath = null) {
    // 1. 更新文件列表项
    const fileItems = document.querySelectorAll(`[data-filename="${oldName}"], [data-original-filename="${oldName}"]`);
    fileItems.forEach(item => {
        // 更新数据属性
        item.dataset.filename = newName;
        item.dataset.originalFilename = newName;
        
        // 更新所有可能包含文件名的元素
        const textElements = item.querySelectorAll('.filename, .file-title, .history-filename, .track-name');
        textElements.forEach(el => el.textContent = newName);
        
        // 强制重新渲染（解决浏览器缓存问题）
        item.style.display = 'none';
        item.offsetHeight; // 触发重排
        item.style.display = '';
    });

    // 2. 更新当前播放状态
    if (oldName === currentFile) {
        currentFile = newName;
        currentTrackEl.textContent = newName;
        
        // 更新播放器路径（防止缓存）
        if (newPath && currentMediaType) {
            const player = currentMediaType === 'video' ? videoPlayer : audioPlayer;
            player.src = newPath + '?t=' + Date.now();
        }
    }

    // 3. 更新内存数据
    const fileIndex = mediaFiles.findIndex(f => f.name === oldName);
    if (fileIndex !== -1) {
        mediaFiles[fileIndex].name = newName;
        if (newPath) mediaFiles[fileIndex].path = newPath;
    }

    // 4. 更新历史记录（如果存在）
    const historyItems = document.querySelectorAll(`.history-item[data-filename="${oldName}"]`);
    historyItems.forEach(item => {
        item.dataset.filename = newName;
        item.querySelectorAll('.history-filename').forEach(el => el.textContent = newName);
    });
}

// 初始化时绑定事件（确保动态生成的元素也能触发）
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('rename-btn')) {
        e.stopPropagation();
        const filename = e.target.dataset.filename;
        const isHistory = e.target.dataset.history === 'true';
        renameFile(filename, isHistory);
    }
});

// 初始化事件监听器
function initEventListeners() {
    playBtn.addEventListener('click', () => {
        const player = getCurrentPlayer();
        player.play();
        updatePlayButton(true);
    });
    
    pauseBtn.addEventListener('click', () => {
        const player = getCurrentPlayer();
        player.pause();
        updatePlayButton(false);
    });
    
    prevBtn.addEventListener('click', () => {
        if (mediaFiles.length === 0) return;
        
        let currentIndex = mediaFiles.findIndex(file => file.name === currentFile);
        if (currentIndex === -1) currentIndex = 0;
        
        const prevIndex = (currentIndex - 1 + mediaFiles.length) % mediaFiles.length;
        playFile(mediaFiles[prevIndex].name);
    });
    
    nextBtn.addEventListener('click', () => {
        if (mediaFiles.length === 0) return;
        
        let currentIndex = mediaFiles.findIndex(file => file.name === currentFile);
        if (currentIndex === -1) currentIndex = -1;
        
        const nextIndex = (currentIndex + 1) % mediaFiles.length;
        playFile(mediaFiles[nextIndex].name);
    });
    
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    
    // 倍速控制
    if (speedSelect) {
        speedSelect.addEventListener('change', (e) => {
            const speed = parseFloat(e.target.value);
            setPlaybackSpeed(speed);
        });
    }
    
    // 静音按钮
    muteBtn.addEventListener('click', toggleMute);
    
    // 音量滑块
    volumeSlider.addEventListener('input', (e) => {
        const volume = parseFloat(e.target.value);
        setVolume(volume);
        updateVolumeUI(volume);
    });
    
    // 音频事件
    audioPlayer.addEventListener('timeupdate', updateProgress);
    audioPlayer.addEventListener('ended', () => {
        updatePlayButton(false);
        nextBtn.click();
    });
    
    // 视频事件
    videoPlayer.addEventListener('timeupdate', updateProgress);
    videoPlayer.addEventListener('ended', () => {
        updatePlayButton(false);
        nextBtn.click();
    });
    
    // 通用播放事件
    videoPlayer.addEventListener('play', () => {
        updatePlayButton(true);
        if (isFullscreen) {
            updateFullscreenPlayButton(true);
        }
    });
    
    videoPlayer.addEventListener('pause', () => {
        updatePlayButton(false);
        if (isFullscreen) {
            updateFullscreenPlayButton(false);
        }
    });
    
    audioPlayer.addEventListener('play', () => updatePlayButton(true));
    audioPlayer.addEventListener('pause', () => updatePlayButton(false));
    
    progressBar.addEventListener('click', setProgress);
    
    // 全屏事件
    document.addEventListener('fullscreenchange', () => {
        isFullscreen = !!document.fullscreenElement;
        if (isFullscreen) {
            showFullscreenControls();
        }
    });
    
    // 视频容器鼠标移动事件（显示控制栏）
    videoContainer.addEventListener('mousemove', () => {
        if (isFullscreen) {
            showFullscreenControls();
        }
    });
    
    // 每5秒更新一次播放位置
    setInterval(updatePosition, 5000);
    
    // 文件选择
    fileList.addEventListener('click', (e) => {
        const fileItem = e.target.closest('.file-item');
        if (fileItem) {
            const filename = fileItem.dataset.filename;
            playFile(filename);
        }
    });
    
    // 播放历史点击
    historyList.addEventListener('click', (e) => {
        const historyItem = e.target.closest('.history-item');
        if (historyItem) {
            const filename = historyItem.dataset.filename;
            playFile(filename);
        }
    });
    
    // 文件上传
    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#3498db';
        uploadArea.style.backgroundColor = 'rgba(52, 152, 219, 0.2)';
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        uploadArea.style.backgroundColor = '';
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        uploadArea.style.backgroundColor = '';
        
        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            uploadFile(file);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            uploadFile(file);
        }
    });
    
    // 删除按钮事件
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止触发文件播放
            const filename = btn.dataset.filename;
            const isHistory = btn.dataset.history === 'true';
            deleteFile(filename, isHistory);
        });
    });
    
    // 重命名按钮事件
    document.querySelectorAll('.rename-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const filename = btn.dataset.filename;
            const isHistory = btn.dataset.history === 'true';
            renameFile(filename, isHistory);
        });
    });
    
    // 重命名模态框事件
    renameCancel.addEventListener('click', () => {
        renameModal.style.display = 'none';
    });
    
    renameConfirm.addEventListener('click', confirmRename);
    
    // 按ESC键关闭模态框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && renameModal.style.display === 'flex') {
            renameModal.style.display = 'none';
        }
    });
    
    // 模态框外点击关闭
    renameModal.addEventListener('click', (e) => {
        if (e.target === renameModal) {
            renameModal.style.display = 'none';
        }
    });
    
    // 回车键确认重命名
    newFilenameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            confirmRename();
        }
    });
}

function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (response.ok) {
            location.reload(); // 刷新页面显示新文件
        }
    });
}

// 初始化应用
function initApp() {
    initMediaFiles();
    initEventListeners();
    updatePlayButton(false);
    
    // 初始化播放速度为1.0x
    setPlaybackSpeed(1.0);
    
    // 初始化音量
    audioPlayer.volume = 1;
    videoPlayer.volume = 1;
    volumeSlider.value = 1;
    fsVolumeSlider.value = 1;
}

// 当页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initApp);
