from flask import Flask, render_template, request, redirect, url_for, g, send_from_directory, jsonify
import sqlite3
import os
from datetime import datetime
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['DATABASE'] = 'media_history.db'
app.config['UPLOAD_FOLDER'] = 'static/media'
app.config['ALLOWED_EXTENSIONS'] = {'mp3', 'wav', 'ogg', 'flac', 'mp4', 'webm', 'mov', 'avi', 'mkv'}
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB 文件大小限制

# 确保上传文件夹存在
if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])

# 静态文件路由
@app.route('/static/media/<path:filename>')
def media_files(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# 数据库初始化
def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(app.config['DATABASE'])
        db.row_factory = sqlite3.Row
        # 创建播放历史表
        db.execute('''
        CREATE TABLE IF NOT EXISTS play_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            position REAL DEFAULT 0,
            media_type TEXT NOT NULL
        )
        ''')
        db.commit()
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def get_media_type(filename):
    ext = filename.rsplit('.', 1)[1].lower()
    if ext in {'mp3', 'wav', 'ogg', 'flac'}:
        return 'audio'
    elif ext in {'mp4', 'webm', 'mov', 'avi', 'mkv'}:
        return 'video'
    return 'unknown'

@app.route('/')
def index():
    db = get_db()
    # 获取播放历史
    history = db.execute('SELECT * FROM play_history ORDER BY timestamp DESC LIMIT 10').fetchall()
    
    # 获取媒体文件列表
    media_files = []
    media_dir = app.config['UPLOAD_FOLDER']
    if os.path.exists(media_dir):
        for file in os.listdir(media_dir):
            if allowed_file(file):
                media_files.append({
                    'name': file,
                    'type': get_media_type(file)
                })
    
    return render_template('index.html', history=history, media_files=media_files)

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return redirect(url_for('index'))
    
    file = request.files['file']
    if file.filename == '':
        return redirect(url_for('index'))
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
    
    return redirect(url_for('index'))

@app.route('/play', methods=['POST'])
def play_file():
    filename = request.form.get('filename')
    if filename and allowed_file(filename):
        media_type = get_media_type(filename)
        
        # 记录播放历史
        db = get_db()
        existing = db.execute('SELECT * FROM play_history WHERE filename = ?', (filename,)).fetchone()
        
        if existing:
            # 更新现有记录
            db.execute('UPDATE play_history SET timestamp = ?, media_type = ? WHERE filename = ?', 
                      (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), media_type, filename))
        else:
            # 添加新记录
            db.execute('INSERT INTO play_history (filename, timestamp, media_type) VALUES (?, ?, ?)',
                      (filename, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), media_type))
        db.commit()
        
        return {
            'status': 'success', 
            'filepath': f"/static/media/{filename}",
            'media_type': media_type
        }
    
    return {'status': 'error', 'message': 'Invalid file'}

@app.route('/update_position', methods=['POST'])
def update_position():
    filename = request.form.get('filename')
    position = request.form.get('position')
    
    if filename and position:
        try:
            position = float(position)
            db = get_db()
            db.execute('UPDATE play_history SET position = ? WHERE filename = ?', (position, filename))
            db.commit()
            return {'status': 'success'}
        except:
            pass
    return {'status': 'error'}

# 删除文件路由
@app.route('/delete', methods=['POST'])
def delete_file():
    filename = request.form.get('filename')
    is_history = request.form.get('is_history') == 'true'
    
    if not filename:
        return jsonify({'status': 'error', 'message': 'Filename is required'}), 400
    
    try:
        # 删除物理文件
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if os.path.exists(file_path):
            os.remove(file_path)
        
        # 删除数据库记录
        db = get_db()
        if is_history:
            # 只删除历史记录，保留文件
            db.execute('DELETE FROM play_history WHERE filename = ?', (filename,))
        else:
            # 删除文件和所有相关记录
            db.execute('DELETE FROM play_history WHERE filename = ?', (filename,))
        db.commit()
        
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

# 重命名文件路由
@app.route('/rename', methods=['POST'])
def rename_file():
    old_filename = request.form.get('old_filename')
    new_filename = request.form.get('new_filename')
    is_history = request.form.get('is_history') == 'true'
    
    if not old_filename or not new_filename:
        return jsonify({'status': 'error', 'message': 'Both filenames are required'}), 400
    
    try:
        # 确保新文件名安全
        new_filename = secure_filename(new_filename)
        
        # 重命名物理文件
        old_path = os.path.join(app.config['UPLOAD_FOLDER'], old_filename)
        new_path = os.path.join(app.config['UPLOAD_FOLDER'], new_filename)
        
        if not os.path.exists(old_path):
            return jsonify({'status': 'error', 'message': 'Original file not found'}), 404
        
        if os.path.exists(new_path):
            return jsonify({'status': 'error', 'message': 'New filename already exists'}), 400
        
        os.rename(old_path, new_path)
        
        # 更新数据库记录
        db = get_db()
        db.execute('UPDATE play_history SET filename = ? WHERE filename = ?', (new_filename, old_filename))
        db.commit()
        
        return jsonify({'status': 'success', 'new_filename': new_filename})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)