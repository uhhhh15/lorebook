(function () {
    'use-strict';

    // --- 配置、常量与持久化 ---
    const STORAGE_KEY = 'lorebookManagerExtensionSettings';
    const LOG_PREFIX = '[附加世界书管理器]';
    const SCRIPT_VERSION = '1.0'; // 版本号更新

    const BUTTON_ID = 'lorebook-manager-ext-button';
    const PANEL_ID = 'lorebook-manager-panel';
    const OVERLAY_ID = 'lorebook-manager-overlay';
    const STYLE_ID = 'lorebook-manager-styles';
    const HELP_PANEL_ID = 'lorebook-manager-help-panel';
    const UPDATE_NOTICE_ID = 'lm-update-notice';

    const DEFAULT_SETTINGS = { favorites: {}, recents: [], lastSeenVersion: '0' };
    let settings = { ...DEFAULT_SETTINGS };
    let panelElement = null;
    let helpPanelElement = null;

    const parentDoc = window.parent.document;
    const parent$ = window.parent.jQuery || window.parent.$;

    // --- 持久化与版本管理 ---
    function loadSettings() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            settings = stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : { ...DEFAULT_SETTINGS };
        } catch (error) { console.error(`${LOG_PREFIX} 加载设置失败:`, error); settings = { ...DEFAULT_SETTINGS }; }
    }
    function saveSettings() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (error) { console.error(`${LOG_PREFIX} 保存设置失败:`, error); }
    }

    function shouldShowUpdateNotice() {
        return settings.lastSeenVersion !== SCRIPT_VERSION;
    }
    function markUpdateNoticeSeen() {
        if (shouldShowUpdateNotice()) {
            settings.lastSeenVersion = SCRIPT_VERSION;
            saveSettings();
        }
    }

    // --- 核心逻辑 (与Tavern API交互) ---
    function getBoundAdditionalLorebooks() {
        try { return (typeof getCharLorebooks === 'function') ? (getCharLorebooks({ type: 'additional' }).additional || []) : []; }
        catch (error) { console.error(`${LOG_PREFIX} 获取附加世界书失败:`, error); return []; }
    }
    async function setBoundAdditionalLorebooks(books) {
        try { if (typeof setCurrentCharLorebooks === 'function') await setCurrentCharLorebooks({ additional: books }); }
        catch (error) { console.error(`${LOG_PREFIX} 设置附加世界书失败:`, error); }
        updateButtonState();
    }
    async function addLorebook(bookName) {
        const currentBooks = getBoundAdditionalLorebooks();
        if (!currentBooks.includes(bookName)) {
            await setBoundAdditionalLorebooks([...currentBooks, bookName]);
            settings.recents = [bookName, ...settings.recents.filter(b => b !== bookName)].slice(0, 20);
            saveSettings();
            await updateUIPanel();
        }
    }
    async function removeLorebook(bookName) {
        const currentBooks = getBoundAdditionalLorebooks();
        await setBoundAdditionalLorebooks(currentBooks.filter(b => b !== bookName));
        await updateUIPanel();
    }

    // --- UI 更新与状态 ---
    function cleanupOldUI() { parent$(`#${BUTTON_ID}, #${OVERLAY_ID}, #${STYLE_ID}`).remove(); }
    function updateButtonState() { parent$(`#${BUTTON_ID}`).toggleClass('world_set', getBoundAdditionalLorebooks().length > 0); }
    
    function closePanel() {
        markUpdateNoticeSeen();
        parent$(`#${OVERLAY_ID}`).hide();
        parent$(`#${HELP_PANEL_ID}`).hide();
        parent$(`#${PANEL_ID}`).show(); 
        parent$(window.parent).off('resize.lm');
        parent$(`#${PANEL_ID} .lm-top-controls`).removeClass('search-active dropdown-open');
        parent$(`#${PANEL_ID} .lm-search-input`).val('').trigger('blur');
        parent$(`#${PANEL_ID} .lm-dropdown-list`).hide();
        parent$(`#${PANEL_ID} .lm-dropdown-display`).removeClass('open');
    }
    
    function centerElement(element) {
        if (!element) return;
        const windowWidth = window.parent.innerWidth, windowHeight = window.parent.innerHeight;
        element.style.left = `${Math.max(0, (windowWidth - element.offsetWidth) / 2)}px`;
        element.style.top = `${Math.max(0, (windowHeight - element.offsetHeight) / 2)}px`;
    }

    function injectStyles() {
        if (parent$(`#${STYLE_ID}`).length > 0) return;
        const styles = `
            <style id="${STYLE_ID}">
                /* --- 基本布局与动画 --- */
                #${BUTTON_ID} { transform: scale(1.0); }
                @keyframes lmFadeIn { from { opacity: 0; transform: translateY(-20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
                #${OVERLAY_ID} { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(0, 0, 0, 0.5); backdrop-filter: blur(5px); z-index: 10000; display: none; }
                
                /* --- 通用面板样式 (Flexbox布局是关键) --- */
                #${PANEL_ID}, #${HELP_PANEL_ID} { 
                    position: fixed; display: flex; flex-direction: column; width: 90%; max-width: 500px; max-height: 85vh; 
                    background: var(--SmartThemeBlurTintColor, #1a1a1c); color: var(--SmartThemeBodyColor, #e0e0e0); 
                    border: 1px solid var(--SmartThemeBorderColor, rgba(255, 255, 255, 0.1)); border-radius: 12px; 
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3); animation: lmFadeIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); z-index: 10001; 
                }
                .lm-panel-header { padding: 12px 20px; border-bottom: 1px solid var(--SmartThemeBorderColor, rgba(255, 255, 255, 0.1)); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
                .lm-panel-header h4 { margin: 0; font-size: 16px; font-weight: 600; }
                .lm-close-btn-top { background: transparent; border: none; font-size: 20px; color: #888; cursor: pointer; transition: color 0.2s ease; }
                .lm-close-btn-top:hover { color: #fff; }
                #lm-show-help-btn { cursor: pointer; transition: color 0.2s ease; }
                #lm-show-help-btn:hover { color: var(--SmartThemeQuoteColor, #e18a24); }

                /* --- 主面板独有样式 --- */
                #${PANEL_ID} { min-height: 550px; }
                #${PANEL_ID} .lm-panel-content { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 20px; }
                .lm-main-content-scrollable { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow-y: auto; }

                /* --- 帮助面板样式 --- */
                #${HELP_PANEL_ID} { display: none; }
                .lm-help-content { 
                    flex: 1; min-height: 0;
                    padding: 0 20px 20px 20px; 
                    overflow-y: auto;
                    line-height: 1.7; 
                }
                .lm-help-footer { padding: 15px 20px; border-top: 1px solid var(--SmartThemeBorderColor, rgba(255, 255, 255, 0.1)); text-align: center; flex-shrink: 0; }
                .lm-help-content h5 { color: var(--SmartThemeQuoteColor, #e18a24); margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.1)); padding-bottom: 5px; }
                .lm-help-content p, .lm-help-content ul { margin-bottom: 10px; }
                .lm-help-content ul { padding-left: 20px; list-style-position: outside; }
                .lm-help-content li { margin-bottom: 8px; }
                .lm-help-li-title { font-weight: bold; white-space: nowrap; }
                .lm-help-li-title .fa-solid { margin-right: 8px; width: 1.2em; text-align: center; }
                .lm-help-content code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-family: monospace; }
                .lm-help-close-btn { background: var(--SmartThemeQuoteColor, #e18a24); color: #fff; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; }

                /* --- 更新日志样式 --- */
                #${UPDATE_NOTICE_ID} { margin-top: auto; padding: 15px; border: 1px solid var(--SmartThemeQuoteColor, #e18a24); background: rgba(225, 138, 36, 0.1); border-radius: 8px; line-height: 1.6; }
                #${UPDATE_NOTICE_ID} h5 { margin-top: 0; color: var(--SmartThemeQuoteColor, #e18a24); }
                #${UPDATE_NOTICE_ID} p { margin: 10px 0; }
                #${UPDATE_NOTICE_ID} ul { padding-left: 20px; margin: 10px 0; }
                #${UPDATE_NOTICE_ID} .update-footer { font-size: 0.85em; color: #888; margin-top: 15px; text-align: center; }

                /* --- 滚动条样式 --- */
                .lm-main-content-scrollable, .lm-bound-list, .lm-dropdown-list { scrollbar-width: none; }
                .lm-main-content-scrollable::-webkit-scrollbar, .lm-bound-list::-webkit-scrollbar, .lm-dropdown-list::-webkit-scrollbar { display: none; }
                .lm-help-content { scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.4) transparent; }
                .lm-help-content::-webkit-scrollbar { width: 8px; }
                .lm-help-content::-webkit-scrollbar-track { background: transparent; }
                .lm-help-content::-webkit-scrollbar-thumb { background-color: rgba(255, 255, 255, 0.3); border-radius: 4px; border: 2px solid transparent; background-clip: padding-box; }
                .lm-help-content::-webkit-scrollbar-thumb:hover { background-color: rgba(255, 255, 255, 0.5); }

                /* --- 顶部控制区域样式 --- */
                .lm-top-controls { display: flex; align-items: center; gap: 10px; flex-shrink: 0; margin-bottom: 10px; }
                .lm-dropdown-container { flex-grow: 1; position: relative; }
                .lm-dropdown-display { display: flex; align-items: center; justify-content: space-between; background: var(--SmartThemeBlurTintColor, rgba(255, 255, 255, 0.05)); border: 2px solid var(--SmartThemeBorderColor, rgba(255, 255, 255, 0.1)); border-radius: 10px; padding: 10px 16px; cursor: pointer; transition: all 0.2s ease; }
                .lm-dropdown-display.open, .lm-dropdown-display:hover { border-color: var(--SmartThemeQuoteColor, #e18a24); }
                .lm-icon-btn { background: transparent; border: none; color: #aaa; font-size: 18px; cursor: pointer; padding: 0; border-radius: 50%; width: 38px; height: 38px; flex-shrink: 0; display: none; align-items: center; justify-content: center; transition: all 0.2s ease; }
                .lm-icon-btn:hover { color: #fff; background: rgba(255, 255, 255, 0.1); }
                .lm-icon-btn.active { color: var(--active, #4a9eff); }
                .lm-top-controls:not(.dropdown-open):not(.search-active) .lm-search-toggle-btn { display: flex; }
                .lm-top-controls.dropdown-open:not(.search-active) .lm-filter-btn { display: flex; }
                .lm-search-input { display: none; width: 100%; box-sizing: border-box; background: var(--SmartThemeBlurTintColor, rgba(255, 255, 255, 0.05)); color: var(--SmartThemeBodyColor, #ffffff); border: 2px solid var(--SmartThemeQuoteColor, #e18a24); border-radius: 10px; padding: 10px 16px; }
                .lm-top-controls.search-active .lm-dropdown-container { display: none; }
                .lm-top-controls.search-active .lm-search-input { display: block; flex-grow: 1; }
                .lm-dropdown-list { position: absolute; top: 100%; left: 0; right: 0; background: var(--SmartThemeBlurTintColor, #2a2a2e); border: 1px solid var(--SmartThemeBorderColor, rgba(255, 255, 255, 0.1)); border-radius: 8px; max-height: 250px; overflow-y: auto; margin-top: 10px; display: none; z-index: 10; }
                
                /* --- 列表样式 --- */
                .lm-list-item { display: flex; align-items: center; padding: 10px 15px; cursor: pointer; transition: background-color 0.2s ease; border-radius: 5px; }
                .lm-list-item:hover { background-color: var(--white30a, rgba(255, 255, 255, 0.3)); }
                .lm-list-item-name { flex-grow: 1; }
                .lm-list-item-fav { color: #888; transition: color 0.2s ease, transform 0.2s ease; }
                .lm-list-item-fav.favorited { color: var(--golden, #f8d300); }
                .lm-list-item-fav:hover { transform: scale(1.2); }
                
                /* --- 已绑定列表样式 --- */
                .lm-bound-list-container { flex-grow: 1; min-height: 0; display: flex; flex-direction: column; }
                .lm-bound-list-container h5 { flex-shrink: 0; margin-bottom: 10px; }
                .lm-bound-list { overflow-y: auto; flex-grow: 1; }
                .lm-bound-item { display: flex; align-items: center; justify-content: space-between; background: rgba(255, 255, 255, 0.03); padding: 8px 15px; border-radius: 8px; margin-bottom: 8px; }
                .lm-delete-btn { background: #f04b59; color: white; border: none; border-radius: 5px; padding: 3px 8px; font-size: 12px; cursor: pointer; transition: background-color 0.2s ease; }
                .lm-delete-btn:hover { background: #d0313f; }
            </style>
        `;
        parent$(parentDoc.head).append(styles);
    }
    
    function createAndInjectUI() {
        const $target = parent$('#avatar_controls > div > #world_button');
        if ($target.length > 0 && parent$(`#${BUTTON_ID}`).length === 0) {
            const $button = $(`<div id="${BUTTON_ID}" class="menu_button interactable" title="附加世界书"><i class="fa-solid fa-layer-group"></i></div>`);
            $button.insertAfter($target);
        }

        if (parent$(`#${OVERLAY_ID}`).length === 0) {
            const updateLogHtml = `
                <div id="${UPDATE_NOTICE_ID}" style="display: none;">
                    <h5>更新日志 (v${SCRIPT_VERSION})</h5>
                    <p>该脚本旨在管理每个角色附加世界书。</p>
                    <p>每个角色都可以绑定多个附加世界书，这比聊天世界书更加的方便。</p>
                    <p><b>核心功能精简说明：</b></p>
                    <ul>
                        <li><b>添加/删除:</b> 通过顶部下拉菜单添加，或在下方列表点击“删除”来移除世界书。</li>
                        <li><b><i class="fa-solid fa-magnifying-glass"></i> 搜索:</b> 快速筛选所有可用的世界书。</li>
                        <li><b><i class="fa-solid fa-filter"></i> 筛选:</b> 只显示你收藏过的世界书。</li>
                        <li><b><i class="fa-solid fa-star"></i> 收藏:</b> 点击星标收藏，方便筛选和排序。</li>
                    </ul>
                    <p><b>点击UI左上角的“附加世界书”标题可以随时查看完整的使用说明，脚本会自动更新，欢迎大家使用！</b></p>
                    <p class="update-footer">此日志仅在版本更新后首次打开时显示。</p>
                </div>
            `;
            
            const helpContentHtml = `<h5><i class="fa-solid fa-book"></i> 插件简介</h5><p>本插件旨在方便地管理与当前角色绑定的“附加世界书”(Additional Lorebooks)。与直接编辑角色卡不同，附加世界书可以让你在不同对话中灵活加载、卸载世界观设定，而无需修改角色本身。</p><h5><i class="fa-solid fa-puzzle-piece"></i> 功能解析</h5><ul><li><b>添加世界书:</b> 在顶部的下拉菜单中选择一个当前未绑定的世界书，即可将其添加到角色。</li><li><b>移除世界书:</b> 在“当前已绑定”列表中，点击对应条目右侧的<code>删除</code>按钮即可。</li><li><b>自动排序:</b> 下拉菜单会优先显示您“最近使用”过的世界书，方便快速选用。</li></ul><h5><i class="fa-solid fa-screwdriver-wrench"></i> 界面操作指南</h5><ul><li><span class="lm-help-li-title"><i class="fa-solid fa-magnifying-glass"></i>搜索:</span> 点击此图标可以激活搜索框，快速在所有未绑定的世界书中进行筛选。</li><li><span class="lm-help-li-title"><i class="fa-solid fa-filter"></i>筛选收藏:</span> 点击此图标后，下拉列表将只显示您收藏的世界书。再次点击取消筛选。</li><li><span class="lm-help-li-title"><i class="fa-solid fa-star"></i>收藏:</span> 在下拉列表的每个条目右侧都有一个星形图标。点击它可以收藏或取消收藏一个世界书，方便通过筛选功能快速找到它。</li></ul><h5><i class="fa-solid fa-lightbulb"></i> 小技巧</h5><p>当你为一个角色绑定了至少一个附加世界书后，主界面上的插件图标 <i class="fa-solid fa-layer-group"></i> 会被点亮，这是一个直观的状态提示。</p><p>这个插件管理的数据是TavernAI的原生功能，即使禁用此插件，已绑定的关系依然存在，数据安全无忧。</p>`;

            const uiHtml = `
                <div id="${OVERLAY_ID}">
                    <div id="${PANEL_ID}">
                        <div class="lm-panel-header"><h4 id="lm-show-help-btn" title="查看详细使用说明">附加世界书</h4><button class="lm-close-btn-top" title="关闭"><i class="fa-solid fa-times"></i></button></div>
                        <div class="lm-panel-content">
                            <div class="lm-top-controls">
                                <div class="lm-dropdown-container">
                                    <div class="lm-dropdown-display"><span>添加一个世界书...</span><i class="fa-solid fa-chevron-down"></i></div>
                                    <div class="lm-dropdown-list"><div class="lm-list-content"></div></div>
                                </div>
                                <input type="text" class="lm-search-input" placeholder="搜索世界书...">
                                <button class="lm-icon-btn lm-search-toggle-btn" data-action="toggle-search" title="搜索"><i class="fa-solid fa-magnifying-glass"></i></button>
                                <button class="lm-icon-btn lm-filter-btn" data-action="toggle-favorites-filter" title="只显示收藏"><i class="fa-solid fa-filter"></i></button>
                            </div>
                            <div class="lm-main-content-scrollable">
                                <div class="lm-bound-list-container">
                                    <h5>当前已绑定</h5>
                                    <div class="lm-bound-list"></div>
                                </div>
                                ${updateLogHtml}
                            </div>
                        </div>
                    </div>
                    
                    <div id="${HELP_PANEL_ID}">
                        <div class="lm-panel-header"><h4>使用说明</h4><button class="lm-close-btn-top" title="关闭"><i class="fa-solid fa-times"></i></button></div>
                        <div class="lm-help-content">${helpContentHtml}</div>
                        <div class="lm-help-footer"><button class="lm-help-close-btn">返回管理面板</button></div>
                    </div>
                </div>`;
            parent$('body').append(uiHtml);
            panelElement = parent$(`#${PANEL_ID}`)[0];
            helpPanelElement = parent$(`#${HELP_PANEL_ID}`)[0];
        }
    }
    
    async function updateUIPanel() { 
        if (!panelElement) return; 
        const boundBooks = getBoundAdditionalLorebooks(); 
        const $boundList = parent$(`#${PANEL_ID} .lm-bound-list`).empty(); 
        if (boundBooks.length > 0) { 
            boundBooks.forEach(bookName => $boundList.append(`<div class="lm-bound-item"><span>${bookName}</span><button class="lm-delete-btn" data-book-name="${bookName}">删除</button></div>`)); 
        } else { 
            $boundList.append('<p style="color: #888; text-align: center; margin-top: 20px;">没有绑定的附加世界书。</p>'); 
        } 
        await updateAvailableLorebooksList(); 
    }

    function updateAvailableLorebooksList(searchTerm = '') { 
        let allBooks, boundBooks, availableBooks; 
        try { 
            if (typeof getLorebooks !== 'function') return; 
            allBooks = getLorebooks() || []; 
            boundBooks = getBoundAdditionalLorebooks(); 
        } catch (e) { 
            console.error(`${LOG_PREFIX} 获取世界书列表时出错:`, e); 
            return; 
        } 
        availableBooks = allBooks.filter(b => !boundBooks.includes(b)); 
        if (searchTerm && typeof searchTerm === 'string' && searchTerm.trim() !== '') { 
            const lowerCaseSearchTerm = searchTerm.toLowerCase(); 
            availableBooks = availableBooks.filter(b => b.toLowerCase().includes(lowerCaseSearchTerm)); 
        } else { 
            const isFavFilterActive = parent$('[data-action="toggle-favorites-filter"]').hasClass('active'); 
            if (isFavFilterActive) {
                availableBooks = availableBooks.filter(b => settings.favorites[b]); 
            }
            availableBooks.sort((a, b) => { 
                const aRecent = settings.recents.indexOf(a);
                const bRecent = settings.recents.indexOf(b);
                if (aRecent !== -1 && bRecent !== -1) return aRecent - bRecent; 
                if (aRecent !== -1) return -1; 
                if (bRecent !== -1) return 1; 
                return a.localeCompare(b); 
            }); 
        } 
        const $listContent = parent$(`#${PANEL_ID} .lm-list-content`).empty(); 
        if (availableBooks.length > 0) { 
            availableBooks.forEach(bookName => { 
                const isFavorited = !!settings.favorites[bookName]; 
                $listContent.append(`<div class="lm-list-item" data-book-name="${bookName}"><span class="lm-list-item-name">${bookName}</span><i class="lm-list-item-fav fa-solid fa-star ${isFavorited ? 'favorited' : ''}" data-book-name="${bookName}" title="收藏"></i></div>`); 
            }); 
        } else { 
            $listContent.append('<div style="padding: 10px 15px; color: #888;">没有可用的世界书。</div>'); 
        } 
    }
    
    // 新增：用于处理动态事件（如角色加载）的函数
    function bindDynamicEvents() {
        $(document).on('CHARACTER_PAGE_LOADED.lm', () => {
            // 使用 .one() 来确保事件只触发一次，然后自动解绑
            $(document).one('GENERATION_AFTER_COMMANDS.lm', () => {
                console.log(`${LOG_PREFIX} 角色加载完成，更新按钮状态。`);
                updateButtonState();
            });
        });
    }

    function bindEvents() {
        const parentBody = parent$('body');
        parentBody.off('.lmEvents');

        parentBody.on('click.lmEvents', `#${BUTTON_ID}`, async (event) => {
            event.stopPropagation();
            loadSettings();
            await updateUIPanel();
            
            if (shouldShowUpdateNotice()) {
                parent$(`#${UPDATE_NOTICE_ID}`).show();
            } else {
                parent$(`#${UPDATE_NOTICE_ID}`).hide();
            }

            parent$(`#${OVERLAY_ID}`).css('display', 'block');
            centerElement(panelElement);
            parent$(window.parent).on('resize.lm', () => centerElement(panelElement));
        });

        parentBody.on('click.lmEvents', `#${OVERLAY_ID}`, (e) => { if(e.target.id === OVERLAY_ID) closePanel(); });
        parentBody.on('click.lmEvents', `.lm-close-btn-top`, () => closePanel());
        
        parentBody.on('click.lmEvents', `#lm-show-help-btn`, () => {
            parent$(`#${PANEL_ID}`).hide();
            parent$(`#${HELP_PANEL_ID}`).show();
            centerElement(helpPanelElement);
            parent$(window.parent).off('resize.lm').on('resize.lm', () => centerElement(helpPanelElement));
        });
        
        parentBody.on('click.lmEvents', `.lm-help-close-btn`, () => {
            parent$(`#${HELP_PANEL_ID}`).hide();
            parent$(`#${PANEL_ID}`).show();
            centerElement(panelElement);
            parent$(window.parent).off('resize.lm').on('resize.lm', () => centerElement(panelElement));
        });
        
        parentBody.on('click.lmEvents', `#${PANEL_ID} .lm-delete-btn`, function() { removeLorebook($(this).data('book-name')); });
        parentBody.on('click.lmEvents', `[data-action="toggle-search"]`, function() { parent$(`#${PANEL_ID} .lm-top-controls`).addClass('search-active'); parent$(`#${PANEL_ID} .lm-dropdown-list`).slideDown(200); updateAvailableLorebooksList(); parent$(`#${PANEL_ID} .lm-search-input`).trigger('focus'); });
        parentBody.on('input.lmEvents', `#${PANEL_ID} .lm-search-input`, _.debounce(function() { updateAvailableLorebooksList($(this).val()); }, 200));
        parentBody.on('blur.lmEvents', `#${PANEL_ID} .lm-search-input`, function() { setTimeout(() => { if (!parent$(`#${PANEL_ID} .lm-top-controls`).find(parentDoc.activeElement).length) { parent$(`#${PANEL_ID} .lm-top-controls`).removeClass('search-active'); parent$(`#${PANEL_ID} .lm-dropdown-list`).slideUp(200); } }, 150); });
        
        // BUG修复：恢复了对 .dropdown-open 类的切换
        parentBody.on('click.lmEvents', `#${PANEL_ID} .lm-dropdown-display`, function() { 
            const $topControls = parent$(`#${PANEL_ID} .lm-top-controls`);
            const $list = parent$(`#${PANEL_ID} .lm-dropdown-list`);
            const isOpen = $list.is(':visible'); 
            $topControls.toggleClass('dropdown-open', !isOpen);
            $(this).toggleClass('open', !isOpen);
            if (!isOpen) { 
                updateAvailableLorebooksList(); 
            } 
            $list.slideToggle(200); 
        });

        parentBody.on('click.lmEvents', `#${PANEL_ID} .lm-list-item`, function(e) { if ($(e.target).hasClass('lm-list-item-fav')) return; addLorebook($(this).data('book-name')); });
        parentBody.on('click.lmEvents', `#${PANEL_ID} .lm-list-item-fav`, function(e) { e.stopPropagation(); const bookName = $(this).data('book-name'); settings.favorites[bookName] = !settings.favorites[bookName]; saveSettings(); $(this).toggleClass('favorited', settings.favorites[bookName]); if (parent$('[data-action="toggle-favorites-filter"]').hasClass('active')) { updateAvailableLorebooksList(); } });
        parentBody.on('click.lmEvents', `[data-action="toggle-favorites-filter"]`, function() { $(this).toggleClass('active'); updateAvailableLorebooksList(); });
    }

    function init() {
        if (!parent$) { console.error(`${LOG_PREFIX} jQuery未找到。`); return; }
        cleanupOldUI(); 
        injectStyles(); 
        createAndInjectUI();
        loadSettings(); 
        bindEvents(); 
        bindDynamicEvents(); // 新增：绑定动态事件
        updateButtonState();
        console.log(`${LOG_PREFIX} 初始化完成 (v${SCRIPT_VERSION})。`);
    }

    function waitForUI() {
        const targetElement = parentDoc.querySelector('#avatar_controls > div > #world_button');
        if (typeof parent$ === 'function' && typeof getCharLorebooks === 'function' && typeof _ !== 'undefined' && targetElement) { init(); } else { setTimeout(waitForUI, 500); }
    }
    
    waitForUI();

})();
