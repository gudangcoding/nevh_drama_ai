<template>
  <div class="studio" v-if="drama">
    <header class="studio-topbar">
      <div class="studio-topbar-main">
        <button class="back-btn topbar-back" @click="navigateTo(`/drama/${dramaId}`)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          <span class="back-label">{{ t('episode.topbar.back') }}</span>
        </button>
        <div class="studio-identity">
          <h1 class="studio-title">{{ drama.title }}</h1>
          <span class="studio-episode-chip">{{ t('episode.topbar.episodeN', { n: episodeNumber }) }}</span>
          <div class="studio-meta-row">
            <span class="studio-meta-pill">{{ currentSubStageLabel }}</span>
            <span class="studio-meta-pill is-progress">{{ pipelineProgress }}/{{ pipelineTotal }}</span>
            <span class="studio-meta-inline">{{ t('episode.topbar.meta', { roles: chars.length, shots: sbs.length }) }}</span>
          </div>
        </div>
      </div>

      <div class="studio-topbar-side">
        <div class="studio-model-picks">
          <ModelSelect
            v-if="textModelOptions.length"
            v-model="chatModel"
            :label="t('common.serviceType.text')"
            :options="textModelOptions"
            :default-label="t('episode.model.defaultWith', { model: textModelOptions[0].model })"
            :show-config="textModelMultiCfg"
          />
          <ModelSelect
            v-if="imageModelOptions.length"
            v-model="imageModel"
            :label="t('common.serviceType.image')"
            :options="imageModelOptions"
            :default-label="t('episode.model.defaultWith', { model: imageModelOptions[0].model })"
            :show-config="imageModelMultiCfg"
          />
          <ModelSelect
            v-if="videoModelOptions.length"
            v-model="videoModel"
            :label="t('common.serviceType.video')"
            :options="videoModelOptions"
            :default-label="t('episode.model.defaultWith', { model: videoModelOptions[0].model })"
            :show-config="videoModelMultiCfg"
          />
          <ModelSelect
            v-model="episodeResolution"
            :label="t('episode.topbar.resolution')"
            :options="resolutionOptions"
            hide-default
          />
        </div>
        <div class="studio-actions">
          <LocaleSwitcher />
          <button class="btn" @click="refresh">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            {{ t('common.refresh') }}
          </button>
          <button class="btn task-drawer-trigger" @click="openTaskDrawer">
            <ListTodo :size="12" />
            {{ t('episode.topbar.tasks') }}
            <span v-if="genTaskActiveCount" class="task-drawer-badge">{{ genTaskActiveCount }}</span>
          </button>
        </div>
      </div>
    </header>

    <div class="studio-body">
    <!-- ========== LEFT SIDEBAR ========== -->
    <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
      <nav class="pipeline">
        <div
          v-for="section in sidebarSections"
          :key="section.id"
          :class="['pipe-section', 'is-' + sectionState(section.id)]"
        >
          <div class="pipe-section-label">
            <span v-if="sectionState(section.id) !== 'none'" class="pipe-section-state">
              <svg v-if="sectionState(section.id) === 'done'" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span v-else-if="sectionState(section.id) === 'active'" class="pipe-section-pulse" />
              <span v-else class="pipe-section-dot" />
            </span>
            <span>{{ section.label }}</span>
            <span v-if="sectionState(section.id) === 'active'" class="pipe-section-tag">{{ t('episode.sidebar.inProgress') }}</span>
          </div>
          <button
            v-for="item in section.items"
            :key="item.key"
            :class="['pipe-item pipe-item-sub', {
              active: activeSubStepKey === item.key,
              done: sectionState(section.id) === 'done',
              doing: sectionState(section.id) === 'active',
            }]"
            :title="sidebarCollapsed ? item.label : undefined"
            @click="goSubStep(item.key)"
          >
            <span class="pipe-icon" :class="sectionState(section.id) === 'done' ? 'icon-done' : activeSubStepKey === item.key ? 'icon-active' : ''">
              <!-- collapsed state: always show step icons, in-progress shown by a small pulse dot in the top-right -->
              <template v-if="sidebarCollapsed">
                <component :is="item.icon" :size="12" />
                <span v-if="sectionState(section.id) === 'active'" class="pipe-mini-pulse" />
              </template>
              <svg v-else-if="sectionState(section.id) === 'done'" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span v-else-if="sectionState(section.id) === 'active'" class="pipe-item-pulse" />
              <component v-else :is="item.icon" :size="11" />
            </span>
            <span class="pipe-copy">
              <span class="pipe-label">{{ item.label }}</span>
              <span v-if="item.desc" class="pipe-sub">{{ item.desc }}</span>
            </span>
          </button>
        </div>
      </nav>

      <!-- Bottom: collapse/expand + Stage marquee + Refresh -->
      <div class="sidebar-bottom">
        <button
          type="button"
          class="sidebar-toggle"
          :title="t(sidebarCollapsed ? 'episode.sidebar.expand' : 'episode.sidebar.collapse')"
          @click="toggleSidebar"
        >
          <svg class="sidebar-toggle-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          <span v-if="!sidebarCollapsed">{{ t('episode.sidebar.collapse') }}</span>
        </button>
        <!-- step marquee: four main-stage progress, flowing glow on the current stage, click a stage to jump -->
        <div class="sidebar-progress">
          <div class="sidebar-progress-head">
            <span class="sidebar-progress-title">{{ currentStageLabel }}</span>
            <span class="sidebar-progress-count">{{ currentMainIdx + 1 }}/{{ mainProgressSteps.length }}</span>
          </div>
          <div class="sidebar-progress-track">
            <button
              v-for="(s, i) in mainProgressSteps"
              :key="s.id"
              type="button"
              :class="['sidebar-progress-seg', { done: i < currentMainIdx || mainStageDone(s.id), current: i === currentMainIdx }]"
              :title="s.label"
              @click="goMainStage(s.id)"
            ><span class="sidebar-progress-seg-fill" /></button>
          </div>
          <div class="sidebar-progress-labels">
            <span
              v-for="(s, i) in mainProgressSteps"
              :key="s.id"
              :class="{ on: i === currentMainIdx, done: i < currentMainIdx || mainStageDone(s.id) }"
            >{{ s.label }}</span>
          </div>
        </div>
        <button class="refresh-btn" @click="refresh">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          {{ t('episode.sidebar.refreshData') }}
        </button>
      </div>
    </aside>

    <!-- ========== MAIN CONTENT ========== -->
    <main class="main">
      <!-- ===== SCRIPT PANEL ===== -->
      <div v-if="panel === 'script'" class="content-panel">
        <!-- Step 0: Raw Content -->
        <div v-if="scriptStep === 0" class="step-editor">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">01</span>
                <span class="step-name">{{ t('episode.script.raw') }}</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span v-if="rawLen" class="char-count">{{ t('episode.script.charCount', { n: rawLen }) }}</span>
              <button class="btn btn-sm" @click="saveRaw(); toast.success(t('episode.script.saved'))">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                {{ t('common.save') }}
              </button>
            </div>
          </div>
          <textarea
            class="fill-textarea"
            v-model="localRaw"
            :placeholder="t('episode.script.rawPlaceholder')"
          />
        </div>

        <!-- Step 1: Rewrite -->
        <div v-else-if="scriptStep === 1" class="step-editor">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">02</span>
                <span class="step-name">{{ t('episode.script.rewrite') }}</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span v-if="scriptLen" class="char-count">{{ t('episode.script.charCount', { n: scriptLen }) }}</span>
              <button v-if="rawContent" class="btn btn-sm" @click="skipRewrite">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/><path d="M13 18l6-6-6-6"/></svg>
                {{ t('episode.script.skipRewrite') }}
              </button>
              <button v-if="scriptContent" class="btn btn-sm" @click="doRewrite" :disabled="rn">
                <Loader2 v-if="rn && rt === 'script_rewriter'" :size="11" class="animate-spin" />
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                {{ t('episode.script.rewriteAgain') }}
              </button>
            </div>
          </div>

          <div v-if="!scriptContent && !rn" class="step-empty">
            <div class="empty-visual">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
            </div>
            <div class="empty-title">{{ t('episode.script.emptyTitle') }}</div>
            <div class="empty-desc">{{ t('episode.script.emptyDesc') }}</div>
            <div class="step-empty-actions">
              <button class="btn btn-primary" @click="doRewrite">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                {{ t('episode.script.startRewrite') }}
              </button>
              <button class="btn" @click="skipRewrite">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/><path d="M13 18l6-6-6-6"/></svg>
                {{ t('episode.script.skipRewrite') }}
              </button>
            </div>
          </div>
          <div v-else-if="rn && rt === 'script_rewriter'" class="step-loading">
            <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
            <div class="loading-text">{{ t('episode.script.rewriting') }}</div>
          </div>
          <textarea v-else class="fill-textarea" v-model="localScript" :placeholder="t('episode.script.scriptPlaceholder')" />
        </div>
      </div>

      <!-- ===== PRODUCTION PANEL ===== -->
      <div v-else-if="panel === 'production'" class="content-panel">
        <!-- Guard: current production step prerequisites -->
        <div v-if="productionBlockMessage" class="step-empty" style="flex:1">
          <div class="empty-visual">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          </div>
          <div class="empty-title">{{ t('episode.prod.notReady') }}</div>
          <div class="empty-desc">{{ productionBlockMessage }}</div>
          <button class="btn btn-primary" @click="goProductionBlockTarget">{{ productionBlockActionLabel }}</button>
        </div>

        <template v-else>
          <!-- production sub-step navigation (assets/storyboard split/video generation) handled by the left sidebar, no longer duplicated at the top -->
          <!-- Sub: Assets -->
          <div v-if="prodTab === 'assets'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ t('episode.prod.assets') }}</span>
              <span class="tag mono">{{ t('episode.prod.readyCount', { ready: assetReadyCount, total: assetTotalCount }) }}</span>
              <div class="ml-auto flex gap-1 asset-bar-actions">
                <button
                  v-for="et in EXTRACT_TARGETS"
                  :key="et.key"
                  class="btn btn-sm asset-btn-extract"
                  :disabled="isExtracting(et.key)"
                  @click="doExtract(et.key)"
                >
                  <Loader2 v-if="isExtracting(et.key)" :size="11" class="animate-spin" />
                  <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  {{ (et.key === 'characters' ? chars.length : et.key === 'scenes' ? scenes.length : propItems.length) ? t('episode.prod.reextract', { type: et.label }) : t('episode.prod.extract', { type: et.label }) }}
                </button>
                <span class="asset-bar-divider" />
                <button class="btn btn-sm asset-btn-batch" @click="batchCharImages">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  {{ t('episode.prod.batchChar') }}
                </button>
                <button class="btn btn-sm asset-btn-batch" @click="batchSceneImages">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  {{ t('episode.prod.batchScene') }}
                </button>
                <button class="btn btn-sm asset-btn-batch" @click="batchPropImages">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  {{ t('episode.prod.batchProp') }}
                </button>
              </div>
            </div>
            <div v-if="assetQueueActive || assetQueue.length" class="asset-queue-bar">
              <Loader2 :size="12" class="animate-spin" />
              <span class="asset-queue-text">{{ assetQueueStatusText }}</span>
              <button v-if="assetQueue.length" class="btn btn-sm" @click="cancelAssetQueue">{{ t('episode.asset.cancelQueue') }}</button>
            </div>
            <div v-if="extractingTargets.length && !chars.length && !scenes.length && !propItems.length" class="step-loading">
              <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
              <div class="loading-text">{{ t('episode.prod.extractingTypes', { types: extractingLabels }) }}</div>
            </div>
            <div v-else-if="!chars.length && !scenes.length && !propItems.length" class="step-empty asset-empty-state">
              <div class="empty-visual">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
              <div class="empty-title">{{ t('episode.prod.emptyTitle') }}</div>
              <div class="empty-desc">{{ t('episode.prod.emptyDesc') }}</div>
              <button class="btn btn-primary" :disabled="!!extractingTargets.length" @click="doExtractAll">
                <Loader2 v-if="extractingTargets.length" :size="13" class="animate-spin" />
                <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                {{ extractingTargets.length ? t('episode.prod.extractingTypesDots', { types: extractingLabels }) : t('episode.prod.startExtract') }}
              </button>
            </div>
            <template v-else>
            <div class="asset-section-title">
              {{ t('common.role') }}
              <button class="asset-add-btn" @click="openAssetCreate('character')"><Plus :size="11" /> {{ t('common.add') }}</button>
            </div>
            <template v-if="visualChars.length">
            <div class="character-asset-grid">
              <article
                v-for="c in visualChars"
                :key="c.id"
                class="card character-asset-card"
                tabindex="0"
                role="button"
                @click="openAssetDetail('character', c)"
                @keydown.enter.prevent="openAssetDetail('character', c)"
                @keydown.space.prevent="openAssetDetail('character', c)"
              >
                <button class="asset-del-btn" :title="t('episode.asset.delChar')" @click.stop="askDeleteAsset('character', c)"><X :size="11" /></button>
                <div class="character-asset-main">
                  <div class="character-asset-overview"><div class="character-portrait">
                      <img
                        v-if="c.image_url || c.imageUrl"
                        :src="thumbOf(assetImageSrc(c))"
                        class="previewable-image"
                        loading="lazy"
                        @error="thumbFallback($event, assetImageSrc(c))"
                        @click.stop="openImageViewer(assetImageSrc(c), t('episode.asset.charImageTitle', { name: c.name }))"
                      />
                      <div v-else class="character-portrait-empty">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      </div>
                      <span class="asset-cover-badge" :class="(c.image_url || c.imageUrl) ? 'is-ready' : (isPendingCharImage(c.id) ? 'is-pending' : '')">
                        {{ (c.image_url || c.imageUrl) ? t('episode.asset.portraitReady') : (isPendingCharImage(c.id) ? t('episode.asset.portraitPending') : t('episode.asset.portraitTodo')) }}
                      </span>
                    </div>

                    <div class="character-asset-head">
                      <div class="character-title-block">
                        <div class="character-name-row">
                          <strong class="character-name">{{ c.name }}</strong>
                          <span class="tag">{{ c.role || t('common.role') }}</span>
                        </div>
                        <div class="character-visual-summary" :title="characterVisualSummary(c)">
                          <span>{{ t('episode.asset.appearance') }}{{ characterAppearanceValue(c) }}</span>
                          <span>{{ t('episode.asset.styling') }}{{ characterStylingValue(c) }}</span>
                        </div>
                      </div>
                      <button class="btn btn-sm character-gen-btn" :disabled="isPendingCharImage(c.id)" @click.stop="genCharImg(c.id)">
                        <Loader2 v-if="isPendingCharImage(c.id)" :size="11" class="animate-spin" />
                        {{ (c.image_url || c.imageUrl) ? t('episode.asset.regen') : (isPendingCharImage(c.id) ? t('episode.asset.generating') : t('episode.asset.generate')) }}
                      </button>
                      <button class="btn btn-sm" :title="t('episode.asset.uploadCharImage')" :disabled="isUploadingAsset('character', c.id)" @click.stop="uploadAssetImage('character', c.id)">
                        <Loader2 v-if="isUploadingAsset('character', c.id)" :size="11" class="animate-spin" />
                        <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        {{ t('episode.asset.upload') }}
                      </button>
                    </div>
                  </div>
                  <div class="asset-final-prompt" :title="c.final_prompt || c.finalPrompt || ''">
                    <span class="afp-label">{{ t('episode.asset.finalPromptTurnaround') }}</span>
                    <span :class="['afp-text', !(c.final_prompt || c.finalPrompt) && 'dim']">{{ c.final_prompt || c.finalPrompt || t('episode.asset.finalPromptAutoTurnaround') }}</span>
                  </div>
                  <div v-if="assetProgressOf('character', c.id)" class="asset-progress" :class="'is-' + (assetProgressOf('character', c.id)?.stage || 'queued')">
                    <div class="asset-progress-top">
                      <span class="asset-progress-label">{{ assetProgressStageLabel('character', c.id) }}</span>
                      <span class="asset-progress-pct mono">{{ assetProgressPercent('character', c.id) }}%</span>
                    </div>
                    <div class="asset-progress-track" role="progressbar" :aria-valuenow="assetProgressPercent('character', c.id)" aria-valuemin="0" aria-valuemax="100">
                      <div class="asset-progress-fill" :style="{ width: assetProgressPercent('character', c.id) + '%' }" />
                    </div>
                  </div>
                </div>
              </article>
            </div>
            </template>

            <div class="asset-section-title">
              {{ t('common.scene') }}
              <button class="asset-add-btn" @click="openAssetCreate('scene')"><Plus :size="11" /> {{ t('common.add') }}</button>
            </div>
            <template v-if="scenes.length">
            <div class="asset-grid">
              <div
                v-for="s in scenes"
                :key="s.id"
                class="card asset-card asset-click-card"
                tabindex="0"
                role="button"
                @click="openAssetDetail('scene', s)"
                @keydown.enter.prevent="openAssetDetail('scene', s)"
                @keydown.space.prevent="openAssetDetail('scene', s)"
              >
                <button class="asset-del-btn" :title="t('episode.asset.delScene')" @click.stop="askDeleteAsset('scene', s)"><X :size="11" /></button>
                <div class="asset-cover wide">
                  <img
                    v-if="s.image_url || s.imageUrl"
                    :src="thumbOf(assetImageSrc(s))"
                    class="previewable-image"
                    loading="lazy"
                    @error="thumbFallback($event, assetImageSrc(s))"
                    @click.stop="openImageViewer(assetImageSrc(s), t('episode.asset.sceneImageTitle', { name: s.location }))"
                  />
                  <div v-else class="asset-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </div>
                  <span class="asset-cover-badge" :class="(s.image_url || s.imageUrl) ? 'is-ready' : (isPendingSceneImage(s.id) ? 'is-pending' : '')">{{ (s.image_url || s.imageUrl) ? t('episode.asset.ready') : (isPendingSceneImage(s.id) ? t('episode.asset.generating') : t('episode.asset.todo')) }}</span>
                </div>
                <div class="asset-body">
                  <div class="asset-name" :title="s.location">{{ s.location }}</div>
                  <div class="asset-meta asset-desc dim" :title="sceneDescriptionValue(s)">{{ sceneDescriptionValue(s) }}</div>
                  <div v-if="sceneLightingValue(s)" class="asset-meta asset-light dim" :title="sceneLightingValue(s)">{{ t('episode.asset.lighting') }}{{ sceneLightingValue(s) }}</div>
                  <div class="asset-meta asset-final" :class="{ dim: !(s.final_prompt || s.finalPrompt) }" :title="s.final_prompt || s.finalPrompt || ''">
                    <span class="afp-label">{{ t('episode.asset.finalPromptFixed') }}</span>
                    {{ s.final_prompt || s.finalPrompt || t('episode.asset.finalPromptAutoFixed') }}
                  </div>
                  <div v-if="assetProgressOf('scene', s.id)" class="asset-progress" :class="'is-' + (assetProgressOf('scene', s.id)?.stage || 'queued')">
                    <div class="asset-progress-top">
                      <span class="asset-progress-label">{{ assetProgressStageLabel('scene', s.id) }}</span>
                      <span class="asset-progress-pct mono">{{ assetProgressPercent('scene', s.id) }}%</span>
                    </div>
                    <div class="asset-progress-track" role="progressbar" :aria-valuenow="assetProgressPercent('scene', s.id)" aria-valuemin="0" aria-valuemax="100">
                      <div class="asset-progress-fill" :style="{ width: assetProgressPercent('scene', s.id) + '%' }" />
                    </div>
                  </div>
                </div>
                <div class="asset-foot">
                  <span :class="['dot', (s.image_url || s.imageUrl) && 'ok', isPendingSceneImage(s.id) && 'pending']" />
                  <button class="btn btn-sm ml-auto" :title="t('episode.asset.uploadSceneImage')" :disabled="isUploadingAsset('scene', s.id)" @click.stop="uploadAssetImage('scene', s.id)">
                    <Loader2 v-if="isUploadingAsset('scene', s.id)" :size="11" class="animate-spin" />
                    <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    {{ t('episode.asset.upload') }}
                  </button>
                  <button class="btn btn-sm" :disabled="isPendingSceneImage(s.id)" @click.stop="genSceneImg(s.id)">
                    <Loader2 v-if="isPendingSceneImage(s.id)" :size="11" class="animate-spin" />
                    {{ (s.image_url || s.imageUrl) ? t('episode.asset.regen') : (isPendingSceneImage(s.id) ? t('episode.asset.generating') : t('episode.asset.generate')) }}
                  </button>
                </div>
              </div>
            </div>
            </template>

            <div class="asset-section-title">
              {{ t('common.prop') }}
              <button class="asset-add-btn" @click="openAssetCreate('prop')"><Plus :size="11" /> {{ t('common.add') }}</button>
            </div>
            <div v-if="propItems.length" class="asset-grid">
              <div
                v-for="p in propItems"
                :key="p.id"
                class="card asset-card asset-click-card prop-card"
                tabindex="0"
                role="button"
                @click="openAssetDetail('prop', p)"
                @keydown.enter.prevent="openAssetDetail('prop', p)"
                @keydown.space.prevent="openAssetDetail('prop', p)"
              >
                <button class="asset-del-btn" :title="t('episode.asset.delProp')" @click.stop="askDeleteAsset('prop', p)"><X :size="11" /></button>
                <div class="asset-cover wide">
                  <img
                    v-if="p.image_url || p.imageUrl"
                    :src="thumbOf(assetImageSrc(p))"
                    class="previewable-image"
                    loading="lazy"
                    @error="thumbFallback($event, assetImageSrc(p))"
                    @click.stop="openImageViewer(assetImageSrc(p), t('episode.asset.propImageTitle', { name: p.name }))"
                  />
                  <div v-else class="asset-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                  </div>
                  <span class="asset-cover-badge" :class="(p.image_url || p.imageUrl) ? 'is-ready' : (isPendingPropImage(p.id) ? 'is-pending' : '')">{{ (p.image_url || p.imageUrl) ? t('episode.asset.ready') : (isPendingPropImage(p.id) ? t('episode.asset.generating') : t('episode.asset.todo')) }}</span>
                </div>
                <div class="asset-body">
                  <div class="prop-name-row">
                    <span class="asset-name" :title="p.name">{{ p.name }}</span>
                    <span class="tag">{{ p.type || t('common.prop') }}</span>
                  </div>
                  <div class="asset-meta asset-desc dim" :title="p.description || ''">{{ p.description || t('episode.asset.noDescription') }}</div>
                  <div class="asset-meta asset-final" :class="{ dim: !(p.final_prompt || p.finalPrompt) }" :title="p.final_prompt || p.finalPrompt || ''">
                    <span class="afp-label">{{ t('episode.asset.finalPromptWhiteBg') }}</span>
                    {{ p.final_prompt || p.finalPrompt || t('episode.asset.finalPromptAutoWhiteBg') }}
                  </div>
                  <div v-if="assetProgressOf('prop', p.id)" class="asset-progress" :class="'is-' + (assetProgressOf('prop', p.id)?.stage || 'queued')">
                    <div class="asset-progress-top">
                      <span class="asset-progress-label">{{ assetProgressStageLabel('prop', p.id) }}</span>
                      <span class="asset-progress-pct mono">{{ assetProgressPercent('prop', p.id) }}%</span>
                    </div>
                    <div class="asset-progress-track" role="progressbar" :aria-valuenow="assetProgressPercent('prop', p.id)" aria-valuemin="0" aria-valuemax="100">
                      <div class="asset-progress-fill" :style="{ width: assetProgressPercent('prop', p.id) + '%' }" />
                    </div>
                  </div>
                </div>
                <div class="asset-foot">
                  <span :class="['dot', (p.image_url || p.imageUrl) && 'ok', isPendingPropImage(p.id) && 'pending']" />
                  <button class="btn btn-sm ml-auto" :title="t('episode.asset.uploadPropImage')" :disabled="isUploadingAsset('prop', p.id)" @click.stop="uploadAssetImage('prop', p.id)">
                    <Loader2 v-if="isUploadingAsset('prop', p.id)" :size="11" class="animate-spin" />
                    <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    {{ t('episode.asset.upload') }}
                  </button>
                  <button class="btn btn-sm" :disabled="isPendingPropImage(p.id)" @click.stop="genPropImg(p.id)">
                    <Loader2 v-if="isPendingPropImage(p.id)" :size="11" class="animate-spin" />
                    {{ (p.image_url || p.imageUrl) ? t('episode.asset.regen') : (isPendingPropImage(p.id) ? t('episode.asset.generating') : t('episode.asset.generate')) }}
                  </button>
                </div>
              </div>
            </div>
            <div v-else class="asset-props-empty">{{ t('episode.asset.propsEmpty') }}</div>
            </template>
          </div>

          <!-- Sub: Video Production (storyboard split + video generation merge) -->
          <div v-if="prodTab === 'videos'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ t('episode.prod.videos') }}</span>
              <span class="tag mono">{{ t('episode.sb.segmentStat', { n: sbs.length, dur: totalDuration }) }}</span>
              <span class="tag mono" :title="t('episode.vid.aspectRatio')">{{ dramaAspectRatio }}</span>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" :disabled="rn" @click="doBreakdown">
                  <Loader2 v-if="rt === 'storyboard_breaker'" :size="11" class="animate-spin" />
                  <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  {{ sbs.length ? t('episode.sb.rebreak') : t('episode.sb.startBreak') }}
                </button>
                <button class="btn btn-sm" :disabled="videoPromptBatch.running || !sbs.length" @click="batchVideoPrompts">
                  <Loader2 v-if="videoPromptBatch.running" :size="11" class="animate-spin" />
                  <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  {{ videoPromptBatch.running ? t('episode.sb.promptProgress', { done: videoPromptBatch.completed, total: videoPromptBatch.total }) : (videoSelectMode && selectedVideoSbIds.length ? t('episode.sb.promptSelected', { n: selectedVideoSbIds.length }) : t('episode.sb.batchPrompts')) }}
                </button>
                <button v-if="videoTaskFailedCount" class="btn btn-sm video-retry-failed" @click="retryFailedVideos">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                  {{ t('episode.vid.retryFailed', { n: videoTaskFailedCount }) }}
                </button>
                <button class="btn btn-sm" :class="{ 'is-on': videoSelectMode }" @click="toggleVideoSelectMode">
                  {{ videoSelectMode ? t('episode.vid.selectDone', { n: selectedVideoSbIds.length }) : t('episode.vid.select') }}
                </button>
                <button class="btn btn-sm" :disabled="!sbs.length" @click="batchVideos">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                  {{ videoSelectMode && selectedVideoSbIds.length ? t('episode.vid.batchSelected', { n: selectedVideoSbIds.length }) : t('episode.vid.batchVideos') }}
                </button>
              </div>
            </div>
            <div v-if="!sbs.length" class="step-empty video-task-empty-state">
              <div class="empty-visual">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><rect x="2" y="2" width="20" height="20" rx="2.5"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="10" y1="8" x2="10" y2="16"/><line x1="13" y1="8" x2="13" y2="16"/></svg>
              </div>
              <div class="empty-title">{{ t('episode.sb.emptyTitle') }}</div>
              <div class="empty-desc">{{ t('episode.sb.emptyDesc') }}</div>
              <div class="locked-config-banner">{{ t('episode.vid.lockedModel') }}{{ effectiveVideoModelLabel }}</div>
              <button class="btn btn-primary" :disabled="rn" @click="doBreakdown">
                <Loader2 v-if="rt === 'storyboard_breaker'" :size="13" class="animate-spin" />
                <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                {{ t('episode.sb.startBreak') }}
              </button>
            </div>
            <div v-else class="video-task-workbench has-player" :style="{ '--vleft': videoLeftW + 'px', '--vright': videoRightW + 'px' }">
              <section class="video-task-list">
                <div class="video-task-head">
                <div>
                  <div class="video-task-title">{{ t('episode.vid.listTitle') }}</div>
                  <div class="video-task-meta">{{ videoListFilter ? t('episode.vid.listMetaFiltered', { n: videoTaskRows.length, total: allVideoTaskRows.length }) : t('episode.vid.listMeta', { n: videoTaskRows.length }) }}</div>
                </div>
                <div class="video-task-metrics">
                  <button type="button" class="video-task-metric is-pending" :class="{ on: videoListFilter === 'pending' }" @click="toggleVideoFilter('pending')">{{ t('episode.vid.metricPending', { n: pendingVideoIds.length }) }}</button>
                  <button type="button" class="video-task-metric is-done" :class="{ on: videoListFilter === 'done' }" @click="toggleVideoFilter('done')">{{ t('episode.vid.metricDone', { n: videoTaskDoneCount }) }}</button>
                  <button type="button" class="video-task-metric is-failed" :class="{ on: videoListFilter === 'failed' }" @click="toggleVideoFilter('failed')">{{ t('episode.vid.metricFailed', { n: videoTaskFailedCount }) }}</button>
                </div>
                </div>
                <div v-if="videoQueueActive || videoQueue.length" class="video-queue-bar">
                  <Loader2 :size="12" class="animate-spin" />
                  <span class="asset-queue-text">{{ videoQueueStatusText }}</span>
                  <button v-if="videoQueue.length" class="btn btn-sm" @click="cancelVideoQueue">{{ t('episode.vid.cancelQueue') }}</button>
                </div>
                <div v-if="videoSelectMode" class="shot-quick-actions video-quick-actions">
                  <button class="shot-quick-btn" @click="toggleSelectAllVideos">{{ t('episode.sb.selectAll') }}</button>
                  <button class="shot-quick-btn" @click="selectMissingVideos">{{ t('episode.vid.selectMissing') }}</button>
                  <button class="shot-quick-btn" @click="selectedVideoSbIds = []">{{ t('episode.sb.clear') }}</button>
                </div>
                <div class="video-task-table">
                <div
                  v-for="task in videoTaskRows"
                  :key="task.id"
                  :class="['video-task-row', 'is-' + videoTaskState(task.storyboard), { active: !videoSelectMode && selectedSb?.id === task.storyboard.id, 'is-selected': videoSelectMode && isVideoSbSelected(task.id) }]"
                  role="button"
                  tabindex="0"
                  @click="onVideoTaskRowClick(task.storyboard)"
                  @keydown.enter.prevent="onVideoTaskRowClick(task.storyboard)"
                  @keydown.space.prevent="onVideoTaskRowClick(task.storyboard)"
                >
                  <div class="video-task-preview">
                    <span
                      v-if="videoSelectMode"
                      class="shot-check video-task-check"
                      :class="{ on: isVideoSbSelected(task.id) }"
                    >
                      <svg v-if="isVideoSbSelected(task.id)" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </span>
                    <video
                      v-if="hasVid(task.storyboard)"
                      :src="'/' + getVideoUrl(task.storyboard)"
                      :poster="posterOf('/' + getVideoUrl(task.storyboard)) || undefined"
                      preload="none"
                      playsinline
                      muted
                      tabindex="-1"
                    />
                    <div v-else class="video-task-empty">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    </div>
                    <span class="video-task-index">#{{ String(task.index + 1).padStart(2, '0') }}</span>
                  </div>
                  <div class="video-task-main">
                    <div class="video-task-line">
                      <strong class="video-task-name">{{ task.title }}</strong>
                    </div>
                    <div class="video-task-meta-line">
                      <span :class="['video-task-state', 'is-' + videoTaskState(task.storyboard)]">
                        <i :class="['dot', videoTaskState(task.storyboard) === 'done' && 'ok', videoTaskState(task.storyboard) === 'pending' && 'pending']" />{{ videoTaskStatusLabel(task.storyboard) }}
                      </span>
                      <span class="video-task-sep">·</span>
                      <span>{{ task.duration }}s</span>
                      <template v-if="videoProgressOf(task.id)">
                        <span class="video-task-sep">·</span>
                        <span class="video-task-queue" :title="videoProgressLabel(task.id)">{{ videoProgressLabel(task.id) }} · {{ videoProgressPercent(task.id) }}%</span>
                      </template>
                      <template v-if="task.meta">
                        <span class="video-task-sep">·</span>
                        <span class="video-task-loc truncate">{{ task.meta }}</span>
                      </template>
                    </div>
                    <div v-if="videoProgressOf(task.id)" class="video-task-progress-track" role="progressbar" :aria-valuenow="videoProgressPercent(task.id)" aria-valuemin="0" aria-valuemax="100">
                      <div class="video-task-progress-fill" :style="{ width: videoProgressPercent(task.id) + '%' }" />
                    </div>
                    <div v-if="task.error" class="video-task-error" :title="task.error">
                      {{ mapError(task.error) }}
                      <div v-if="videoModerationHint(task.error)" class="video-task-error-hint">{{ videoModerationHint(task.error) }}</div>
                    </div>
                  </div>
                  <button
                    class="btn btn-icon btn-sm video-task-action"
                    :title="videoTaskActionLabel(task.storyboard)"
                    :disabled="videoTaskState(task.storyboard) === 'pending'"
                    @click.stop="genVid(task.storyboard)"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                  </button>
                </div>
                </div>
              </section>

              <div v-if="selectedSb" class="video-task-side">
              <div class="video-main-col">
              <div class="video-main-scroll">
                <div class="video-main-grid">
                  <section class="video-inspector-section">
                    <span class="video-inspector-label">{{ t('episode.sb.descSection') }}</span>
                    <label class="field">
                      <span class="field-label">{{ t('episode.sb.descLabel') }} <span class="dim">({{ t('episode.sb.descHint') }})</span></span>
                      <textarea :value="selectedSb.description || ''" class="textarea" rows="7" @blur="updateField(selectedSb, 'description', $event.target.value)" :placeholder="t('episode.sb.descPlaceholder')" />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ t('episode.sb.atmosphere') }}</span>
                      <textarea :value="selectedSb.atmosphere || ''" class="textarea" rows="2" @blur="updateField(selectedSb, 'atmosphere', $event.target.value)" :placeholder="t('episode.sb.atmospherePlaceholder')" />
                    </label>
                  </section>

                  <section class="video-inspector-section">
                    <div class="video-inspector-prompt-head">
                      <span class="video-inspector-label">{{ t('episode.ref.title') }}</span>
                      <span class="tag mono">{{ t('episode.ref.boundCount', { bound: refBindableAssets.filter(a => a.bound).length, total: refBindableAssets.length }) }}</span>
                    </div>
                    <div class="storyboard-ref-list is-embedded">
                      <template v-for="g in REF_KINDS" :key="g.kind">
                        <div v-if="refBindableAssets.filter(a => a.kind === g.kind).length" class="storyboard-ref-group">
                          <div class="storyboard-ref-group-label">{{ g.label }}</div>
                          <div
                            v-for="asset in refBindableAssets.filter(a => a.kind === g.kind)"
                            :key="asset.key"
                            :class="['storyboard-ref-item', { bound: asset.bound }]"
                            :title="asset.bound ? t('episode.ref.clickRemove') : t('episode.ref.clickAdd')"
                            @click="toggleShotBind(selectedSb, asset)"
                          >
                            <button
                              type="button"
                              class="storyboard-ref-thumb"
                              :disabled="!asset.ready"
                              @click.stop="asset.ready && openImageViewer(assetImageSrc({ imageUrl: asset.imageUrl }), `${asset.name} ${asset.typeLabel}`)"
                            >
                              <img v-if="asset.ready" :src="thumbOf(assetImageSrc({ imageUrl: asset.imageUrl }))" class="previewable-image" loading="lazy" @error="thumbFallback($event, assetImageSrc({ imageUrl: asset.imageUrl }))" />
                              <span v-else>{{ asset.kind === 'scene' ? t('episode.ref.shortScene') : asset.kind === 'prop' ? t('episode.ref.shortProp') : t('episode.ref.shortChar') }}</span>
                            </button>
                            <div class="storyboard-ref-main">
                              <span class="storyboard-ref-name">{{ asset.name }}</span>
                              <span class="storyboard-ref-meta">{{ asset.typeLabel }} · {{ asset.meta }}</span>
                              <span :class="['storyboard-ref-state', asset.bound && asset.ready ? 'is-ready' : '']">
                                {{ asset.bound ? (asset.ready ? t('episode.ref.usable') : t('episode.ref.notReady')) : t('episode.ref.unbound') }}
                              </span>
                              <button v-if="asset.bound && !asset.ready" type="button" class="storyboard-ref-goto" @click.stop="prodTab = 'assets'">{{ t('episode.ref.gotoGenerate') }}</button>
                            </div>
                          </div>
                        </div>
                      </template>
                      <div v-if="!refBindableAssets.length" class="storyboard-ref-empty">{{ t('episode.ref.empty') }}</div>
                    </div>
                  </section>
                </div>

                  <section class="video-inspector-section">
                    <div class="video-inspector-prompt-head">
                      <span class="video-inspector-label video-inspector-label-hero">{{ t('episode.sb.videoPromptSection') }}</span>
                      <button
                        type="button"
                        class="btn btn-sm"
                        :disabled="videoPromptGeneratingIds.includes(selectedSb?.id) || videoPromptBatch.running"
                        @click="genVideoPrompt(selectedSb)"
                      >
                        <Loader2 v-if="videoPromptGeneratingIds.includes(selectedSb?.id)" :size="11" class="animate-spin" />
                        {{ (selectedSb.video_prompt || selectedSb.videoPrompt) ? t('episode.sb.regenPrompt') : t('episode.sb.aiGenerate') }}
                      </button>
                    </div>
                    <MentionTextarea
                      :model-value="selectedSb.video_prompt || selectedSb.videoPrompt || ''"
                      :options="mentionOptions"
                      :rows="14"
                      input-class="textarea video-inspector-prompt"
                      :placeholder="t('episode.inspector.videoPromptPlaceholder')"
                      @commit="v => updateField(selectedSb, 'video_prompt', v)"
                    />
                  </section>
              </div>
              </div>

              <aside class="video-task-inspector">
            <aside class="video-task-player">
              <div class="video-player-head">
                <div class="video-player-head-info">
                  <div class="video-player-title">{{ t('episode.vid.playerTitle', { n: String(selectedVideoTaskNumber).padStart(2, '0') }) }}</div>
                  <span :class="['video-task-status', 'is-' + videoTaskState(selectedSb)]">
                    <span :class="['dot', videoTaskState(selectedSb) === 'done' && 'ok', videoTaskState(selectedSb) === 'pending' && 'pending']" />
                    {{ videoTaskStatusLabel(selectedSb) }}
                  </span>
                  <span v-if="videoProgressOf(selectedSb.id)" class="video-task-queue">{{ videoProgressLabel(selectedSb.id) }} · {{ videoProgressPercent(selectedSb.id) }}%</span>
                  <span v-if="selectedSb.duration" class="video-player-sub">{{ selectedSb.duration }}s</span>
                </div>
                <button
                  v-if="previewVideoUrl"
                  class="btn btn-sm btn-primary"
                  @click="setAsMainVideo"
                >
                  {{ t('episode.vid.setMain') }}
                </button>
                <a
                  v-if="previewVideoUrl || hasVid(selectedSb)"
                  :href="'/' + (previewVideoUrl || getVideoUrl(selectedSb))"
                  download
                  class="btn btn-sm"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  {{ t('common.download') }}
                </a>
              </div>
              <div class="video-player-stage">
                <video
                  v-if="previewVideoUrl || hasVid(selectedSb)"
                  :key="previewVideoUrl || getVideoUrl(selectedSb)"
                  :src="'/' + (previewVideoUrl || getVideoUrl(selectedSb))"
                  :poster="posterOf('/' + (previewVideoUrl || getVideoUrl(selectedSb))) || undefined"
                  controls
                  preload="metadata"
                  playsinline
                  class="video-player-video"
                />
                <div v-else class="video-player-empty">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                  <div class="video-player-empty-copy">
                    <div class="video-player-empty-title">{{ videoTaskState(selectedSb) === 'pending' ? t('episode.vid.emptyGenerating') : t('episode.vid.emptyNoVideo') }}</div>
                    <div class="video-player-empty-desc">{{ videoTaskState(selectedSb) === 'pending' ? t('episode.vid.emptyGeneratingDesc') : t('episode.vid.emptyNoVideoDesc') }}</div>
                  </div>
                  <button
                    v-if="videoTaskState(selectedSb) !== 'pending'"
                    class="btn btn-primary btn-sm video-player-empty-action"
                    @click="genVid(selectedSb)"
                  >
                    {{ t('episode.vid.generateVideo') }}
                  </button>
                </div>
              </div>
            </aside>

            <div v-if="sbVideoHistory.length" class="video-player-history">
              <div class="video-player-history-head">
                <span>{{ t('episode.vid.history') }}</span>
                <span class="video-player-history-count">{{ sbVideoHistory.length }}</span>
              </div>
              <div class="video-player-history-list">
                <div
                  v-for="h in sbVideoHistory"
                  :key="h.id"
                  :class="['video-history-item', { current: isCurrentVideo(h), viewing: !!previewVideoUrl && previewVideoUrl === taskVideoPath(h) }]"
                  role="button"
                  tabindex="0"
                  @click="previewHistoryVideo(h)"
                  @keydown.enter.prevent="previewHistoryVideo(h)"
                >
                  <video :src="'/' + taskVideoPath(h)" :poster="posterOf('/' + taskVideoPath(h)) || undefined" preload="none" muted playsinline tabindex="-1" />
                  <span class="video-history-time">{{ formatHistoryTime(taskCreatedAt(h)) }}</span>
                  <span v-if="isCurrentVideo(h)" class="video-history-badge">{{ t('episode.vid.current') }}</span>
                  <button v-else type="button" class="video-history-del" :title="t('episode.vid.deleteRecord')" @click.stop="removeHistoryVideo(h)">×</button>
                </div>
              </div>
            </div>
                <div class="video-inspector-body">
                  <section class="video-inspector-section">
                    <div class="video-inspector-prompt-head">
                      <span class="video-inspector-label">{{ t('episode.inspector.boundRefs') }}</span>
                      <span class="tag mono">{{ boundRefAssets.length }}</span>
                    </div>
                    <div v-if="boundRefAssets.length" class="video-bound-refs">
                      <button
                        v-for="asset in boundRefAssets"
                        :key="asset.key"
                        type="button"
                        class="video-bound-ref"
                        :disabled="!asset.ready"
                        :title="`${asset.name} · ${asset.typeLabel}`"
                        @click="asset.ready && openImageViewer(assetImageSrc({ imageUrl: asset.imageUrl }), `${asset.name} ${asset.typeLabel}`)"
                      >
                        <img v-if="asset.ready" :src="thumbOf(assetImageSrc({ imageUrl: asset.imageUrl }))" :alt="asset.name" loading="lazy" @error="thumbFallback($event, assetImageSrc({ imageUrl: asset.imageUrl }))" />
                        <span v-else class="video-bound-ref-empty">{{ asset.kind === 'scene' ? t('episode.ref.shortScene') : asset.kind === 'prop' ? t('episode.ref.shortProp') : t('episode.ref.shortChar') }}</span>
                        <small>{{ asset.name }}</small>
                      </button>
                    </div>
                    <div v-else class="video-bound-refs-empty">{{ t('episode.inspector.noBoundRefs') }}</div>
                  </section>
                </div>

                <!-- shot duration + generate actions pinned to the bottom: does not scroll with the inspector -->
                <div class="video-inspector-footer">
                  <section class="video-inspector-section video-params-card">
                    <div class="video-param-row">
                      <span class="video-param-name">{{ t('episode.inspector.duration') }}</span>
                      <span class="video-param-control">
                        <input
                          :value="selectedSb.duration || 10"
                          type="number"
                          :min="isWan3Video ? 2 : 4"
                          :max="isWan3Video ? 30 : 15"
                          class="input video-duration-input"
                          @change="onVideoDurationChange"
                        />
                        <span class="video-param-unit">{{ isWan3Video ? t('episode.inspector.durationUnitWan') : t('episode.inspector.durationUnit') }}</span>
                      </span>
                    </div>
                    <div class="video-param-hint">{{ t('episode.inspector.durationHint') }}</div>
                  </section>
                  <div class="video-inspector-effective">
                    {{ t('episode.inspector.effective', { model: effectiveVideoModelLabel || t('episode.vid.defaultModel'), res: episodeResolutionShort, dur: effectiveVideoDuration }) }}
                  </div>
                  <button
                    class="btn btn-primary video-inspector-action"
                    :disabled="videoTaskState(selectedSb) === 'pending'"
                    @click="genVid(selectedSb)"
                  >
                    {{ videoTaskActionLabel(selectedSb) }}
                  </button>
                </div>
              </aside>
              </div>
              <div
                class="video-col-divider is-left"
                role="separator"
                aria-orientation="vertical"
                @pointerdown="startVideoColDrag('left', $event)"
                @dblclick="videoLeftW = VIDEO_COL_DEFAULTS.left"
              ></div>
              <div
                class="video-col-divider is-right"
                role="separator"
                aria-orientation="vertical"
                @pointerdown="startVideoColDrag('right', $event)"
                @dblclick="videoRightW = VIDEO_COL_DEFAULTS.right"
              ></div>
            </div>
          </div>

          <!-- Production Navigator -->
        </template>
      </div>

      <!-- ===== EXPORT PANEL ===== -->
      <div v-else class="content-panel">
        <div v-if="!sbs.length" class="step-empty" style="flex:1">
          <div class="empty-visual">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </div>
          <div class="empty-title">{{ t('episode.prod.notReady') }}</div>
          <div class="empty-desc">{{ t('episode.export.notReadyDesc') }}</div>
          <button class="btn btn-primary" @click="panel = 'script'">{{ t('episode.export.gotoScript') }}</button>
        </div>
        <div v-else class="export-split">
          <div class="export-main">
            <!-- top:merged video list -->
            <div class="export-section">
              <div class="export-section-head">
                <span class="export-section-title">{{ t('episode.export.filmList') }}</span>
                <span class="dim" style="font-size:11px">{{ t('episode.export.countN', { n: exportMerges.length }) }}</span>
                <button
                  :class="['btn btn-sm ml-auto export-done-btn', { on: exportDone }]"
                  :title="t('episode.export.markDoneTitle')"
                  @click="toggleExportDone"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {{ exportDone ? t('episode.export.markedDone') : t('episode.export.markDone') }}
                </button>
                <button class="btn btn-sm" @click="loadExportMerges">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                  {{ t('common.refresh') }}
                </button>
              </div>
              <div v-if="exportMerges.length" class="export-merge-strip">
                <div
                  v-for="m in exportMerges"
                  :key="m.id"
                  :class="['merge-card', m.status === 'completed' && m.merged_url && 'playable']"
                  :role="m.status === 'completed' && m.merged_url ? 'button' : undefined"
                  :tabindex="m.status === 'completed' && m.merged_url ? 0 : undefined"
                  @click="m.status === 'completed' && m.merged_url && (activeMerge = m)"
                  @keydown.enter.prevent="m.status === 'completed' && m.merged_url && (activeMerge = m)"
                >
                  <div class="merge-card-thumb">
                    <video
                      v-if="m.status === 'completed' && m.merged_url"
                      :src="'/' + m.merged_url"
                      :poster="posterOf('/' + m.merged_url) || undefined"
                      preload="none"
                      muted
                      playsinline
                      tabindex="-1"
                    />
                    <div v-else :class="['merge-card-pending', m.status === 'failed' && 'is-failed']" :title="m.status === 'failed' ? m.error_msg : null">
                      {{ m.status === 'failed' ? mapError(m.error_msg, { fallback: 'episode.export.mergeFailed' }) : t('episode.export.merging') }}
                    </div>
                    <span v-if="m.status === 'completed' && m.merged_url" class="merge-card-play">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                    </span>
                  </div>
                  <div class="merge-card-meta">
                    <span class="mono">{{ formatHistoryTime(m.created_at) }}</span>
                    <span v-if="m.duration">· {{ m.duration }}s</span>
                    <a
                      v-if="m.status === 'completed' && m.merged_url"
                      :href="'/' + m.merged_url"
                      download
                      class="btn btn-sm"
                      @click.stop
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      {{ t('common.download') }}
                    </a>
                  </div>
                </div>
              </div>
              <div v-else class="export-merge-empty">{{ t('episode.export.empty') }}</div>
            </div>

            <!-- bottom:shot assets(selectable) -->
            <div class="export-section export-section-grow">
              <div class="export-section-head">
                <span class="export-section-title">{{ t('episode.export.shotAssets') }}</span>
                <span class="dim" style="font-size:11px">{{ t('episode.export.shotStat', { done: shotVidCount, total: sbs.length, selected: exportSelectedReadyIds.length }) }}</span>
                <div class="ml-auto flex gap-1">
                  <button class="btn btn-sm" :disabled="!exportReadyIds.length" @click="toggleSelectAllExport">
                    {{ exportSelectedReadyIds.length === exportReadyIds.length && exportReadyIds.length ? t('episode.export.clearSelection') : t('episode.export.selectAllReady') }}
                  </button>
                  <label
                    class="export-subtitle-toggle"
                    :title="t('episode.export.subtitleTitle')"
                  >
                    <input v-model="burnSubtitles" type="checkbox" />
                    <span>{{ t('episode.export.burnSubtitles') }}</span>
                  </label>
                  <button
                    class="btn btn-sm btn-primary"
                    :disabled="!exportSelectedReadyIds.length"
                    @click="doMerge(exportSelectedReadyIds)"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                    {{ t('episode.export.mergeSelected', { n: exportSelectedReadyIds.length }) }}
                  </button>
                </div>
              </div>
              <div class="export-grid">
                <div
                  v-for="(sb, i) in sbs"
                  :key="sb.id"
                  :class="['exp-card', { selected: isExportSelected(sb.id), playable: hasVid(sb) }]"
                  :role="hasVid(sb) ? 'button' : undefined"
                  :tabindex="hasVid(sb) ? 0 : undefined"
                  @click="toggleExportSelect(sb)"
                  @keydown.enter.prevent="toggleExportSelect(sb)"
                >
                  <div class="exp-thumb">
                    <video
                      v-if="hasVid(sb)"
                      :src="'/' + getVideoUrl(sb)"
                      :poster="posterOf('/' + getVideoUrl(sb)) || undefined"
                      preload="none"
                      muted
                      playsinline
                      tabindex="-1"
                    />
                    <div v-else class="exp-thumb-empty">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    </div>
                    <span class="exp-thumb-index">#{{ String(i+1).padStart(2,'0') }}</span>
                    <span v-if="sb.duration" class="exp-thumb-duration">{{ sb.duration }}s</span>
                    <span
                      v-if="hasVid(sb)"
                      class="exp-play"
                      :title="t('episode.export.previewShot')"
                      @click.stop="previewShot = sb"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                    </span>
                    <span v-if="hasVid(sb)" :class="['exp-check', isExportSelected(sb.id) && 'on']">
                      <svg v-if="isExportSelected(sb.id)" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </span>
                  </div>
                  <div class="exp-row-line">
                    <span class="truncate" style="flex:1;font-size:11px">{{ sb.description || sb.title || '—' }}</span>
                    <span :class="['dot', hasVid(sb) && 'ok']" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== TASK DRAWER ===== -->
      <div v-if="taskDrawer" class="task-drawer-overlay" @click.self="closeTaskDrawer">
        <aside class="task-drawer" role="dialog" aria-modal="true" :aria-label="t('episode.tasks.title')">
          <header class="task-drawer-head">
            <div>
              <div class="video-task-title">{{ t('episode.tasks.title') }}</div>
              <div class="video-task-meta">{{ t('episode.tasks.meta', { n: genTaskRows.length }) }}</div>
            </div>
            <div class="task-drawer-head-actions">
              <button class="btn btn-sm" @click="loadGenTasks">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                {{ t('common.refresh') }}
              </button>
              <button class="btn btn-ghost btn-icon" @click="closeTaskDrawer"><X :size="14" /></button>
            </div>
          </header>
          <div class="video-task-metrics task-drawer-metrics">
            <span class="video-task-metric is-pending">{{ t('episode.vid.metricPending', { n: genTaskActiveCount }) }}</span>
            <span class="video-task-metric is-done">{{ t('episode.vid.metricDone', { n: genTaskDoneCount }) }}</span>
            <span class="video-task-metric is-failed">{{ t('episode.vid.metricFailed', { n: genTaskFailedCount }) }}</span>
          </div>
          <div v-if="!genTaskRows.length" class="step-empty task-drawer-empty">
            <div class="empty-visual">
              <ListTodo :size="32" />
            </div>
            <div class="empty-title">{{ t('episode.tasks.emptyTitle') }}</div>
            <div class="empty-desc">{{ t('episode.tasks.emptyDesc') }}</div>
          </div>
          <div v-else class="video-task-table task-drawer-body">
            <div
              v-for="row in genTaskRows"
              :key="row.key"
              :class="['video-task-row', 'gen-task-row', 'is-' + genTaskStateClass(row.status)]"
            >
              <div class="video-task-preview">
                <video
                  v-if="row.previewUrl && (row.kind === 'video' || row.kind === 'merge')"
                  :src="genTaskPreviewSrc(row.previewUrl)"
                  :poster="posterOf(genTaskPreviewSrc(row.previewUrl)) || undefined"
                  controls
                  preload="none"
                  playsinline
                />
                <img
                  v-else-if="row.previewUrl"
                  :src="thumbOf(genTaskPreviewSrc(row.previewUrl))"
                  :alt="row.targetLabel"
                  loading="lazy"
                  @error="thumbFallback($event, genTaskPreviewSrc(row.previewUrl))"
                  @click="openImageViewer(genTaskPreviewSrc(row.previewUrl), row.targetLabel)"
                />
                <div v-else class="video-task-empty">
                  <Loader2 v-if="genTaskStateClass(row.status) === 'pending'" :size="18" class="animate-spin" />
                  <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                </div>
                <span class="video-task-index">{{ genTaskKindLabel(row.kind) }}</span>
              </div>
              <div class="video-task-main">
                <div class="video-task-line">
                  <strong class="video-task-name truncate">{{ row.targetLabel }}</strong>
                </div>
                <div class="video-task-meta-line">
                  <span class="video-task-loc truncate">{{ row.provider }}{{ row.model ? ' · ' + row.model : '' }}</span>
                  <template v-if="genTaskDuration(row)">
                    <span class="video-task-sep">·</span>
                    <span>{{ t('episode.tasks.duration', { dur: genTaskDuration(row) }) }}</span>
                  </template>
                  <span class="video-task-sep">·</span>
                  <span>#{{ row.id }}</span>
                </div>
                <div v-if="row.errorMsg" class="video-task-error" :title="row.errorMsg">
                  {{ mapError(row.errorMsg) }}
                  <div v-if="row.kind === 'video' && videoModerationHint(row.errorMsg)" class="video-task-error-hint">{{ videoModerationHint(row.errorMsg) }}</div>
                </div>
              </div>
              <span :class="['video-task-status', 'is-' + genTaskStateClass(row.status)]">
                <span :class="['dot', genTaskStateClass(row.status) === 'done' && 'ok', genTaskStateClass(row.status) === 'pending' && 'pending']" />
                {{ genTaskStatusLabel(row.status) }}
              </span>
            </div>
          </div>
        </aside>
      </div>

      <div v-if="assetDetail.open && assetDetail.item" class="overlay asset-detail-overlay" @click.self="closeAssetDetail">
        <section
          class="dialog asset-detail-dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="t('episode.asset.detailTitle', { type: assetTypeLabel(assetDetail.type) })"
        >
          <header class="dialog-head asset-detail-head">
            <div class="asset-detail-title-block">
              <span class="asset-detail-kicker">{{ assetTypeLabel(assetDetail.type) }}</span>
              <h2 class="asset-detail-title">{{ assetDetailTitle(assetDetail) }}</h2>
            </div>
            <div class="asset-detail-head-actions">
              <span class="tag" v-if="assetDetail.type === 'character'">{{ assetDetail.item.role || t('common.role') }}</span>
              <span class="tag" v-else-if="assetDetail.type === 'prop'">{{ assetDetail.item.type || t('common.prop') }}</span>
              <span class="tag" v-else>{{ assetDetail.item.time || t('episode.asset.noTime') }}</span>
              <button class="btn btn-ghost btn-icon" @click="closeAssetDetail">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </header>

          <div class="dialog-body asset-detail-body">
            <div class="asset-detail-shell">
              <aside class="asset-detail-preview-panel">
                <div class="asset-detail-section-title">
                  <span>{{ t('episode.asset.visualPreview') }}</span>
                  <span :class="['asset-detail-state', assetImageSrc(assetDetail.item) ? 'is-ready' : '']">
                    {{ assetImageSrc(assetDetail.item) ? t('episode.asset.ready') : t('episode.asset.todo') }}
                  </span>
                </div>

                <button
                  type="button"
                  class="asset-detail-media-frame"
                  :disabled="!assetImageSrc(assetDetail.item)"
                  @click.stop="openImageViewer(assetImageSrc(assetDetail.item), assetDetailImageTitle(assetDetail))"
                >
                  <img
                    v-if="assetImageSrc(assetDetail.item)"
                    :src="thumbOf(assetImageSrc(assetDetail.item))"
                    class="previewable-image"
                    @error="thumbFallback($event, assetImageSrc(assetDetail.item))"
                  />
                  <span v-else class="asset-detail-media-empty">
                    <svg v-if="assetDetail.type === 'character'" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <svg v-else-if="assetDetail.type === 'prop'" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                    <svg v-else width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </span>
                </button>

                <div class="asset-detail-meta-row">
                  <div class="asset-detail-meta-item">
                    <span>{{ t('episode.asset.kindLabel') }}</span>
                    <strong>{{ assetDetail.type === 'character' ? t('episode.asset.charPortrait') : assetDetail.type === 'prop' ? t('common.prop') : t('episode.asset.sceneImage') }}</strong>
                  </div>
                  <div class="asset-detail-meta-item">
                    <span>{{ assetDetail.type === 'character' ? t('episode.asset.roleLabel') : assetDetail.type === 'prop' ? t('episode.asset.propTypeLabel') : t('episode.asset.timeLabel') }}</span>
                    <strong>{{ assetDetail.type === 'character' ? (assetDetail.item.role || t('common.role')) : assetDetail.type === 'prop' ? (assetDetail.item.type || t('common.prop')) : (assetDetail.item.time || t('episode.asset.noTime')) }}</strong>
                  </div>
                </div>
              </aside>

              <section class="asset-detail-editor-panel">
                <div class="asset-detail-section-title">
                  <span>{{ t('episode.asset.editInfo') }}</span>
                  <span class="dim">{{ assetDetail.type === 'character' ? t('episode.asset.editHintChar') : assetDetail.type === 'prop' ? t('episode.asset.editHintProp') : t('episode.asset.editHintScene') }}</span>
                </div>

                <div v-if="assetDetail.type === 'prop'" class="asset-detail-edit-grid asset-detail-edit-grid--prop">
                  <label class="asset-detail-edit-field">
                    <span>{{ t('episode.asset.appearanceOfObject') }}</span>
                    <textarea
                      v-model="assetDetailDraft.description"
                      class="textarea asset-detail-textarea"
                      rows="6"
                      :placeholder="t('episode.asset.appearancePlaceholder')"
                    />
                  </label>
                </div>

                <div v-else :class="['asset-detail-edit-grid', `asset-detail-edit-grid--${assetDetail.type}`]">
                  <label v-if="assetDetail.type === 'character'" class="asset-detail-edit-field">
                    <span>{{ t('episode.asset.appearanceField') }}</span>
                    <textarea
                      v-model="assetDetailDraft.appearance"
                      class="textarea asset-detail-textarea"
                      rows="6"
                      :placeholder="t('episode.asset.appearanceFieldPlaceholder')"
                    />
                  </label>
                  <label v-if="assetDetail.type === 'character'" class="asset-detail-edit-field">
                    <span>{{ t('episode.asset.stylingField') }}</span>
                    <textarea
                      v-model="assetDetailDraft.styling"
                      class="textarea asset-detail-textarea"
                      rows="6"
                      :placeholder="t('episode.asset.stylingFieldPlaceholder')"
                    />
                  </label>
                  <label v-if="assetDetail.type === 'scene'" class="asset-detail-edit-field">
                    <span>{{ t('episode.asset.sceneDescField') }}</span>
                    <textarea
                      v-model="assetDetailDraft.prompt"
                      class="textarea asset-detail-textarea"
                      rows="5"
                      :placeholder="t('episode.asset.sceneDescPlaceholder')"
                    />
                  </label>
                  <label v-if="assetDetail.type === 'scene'" class="asset-detail-edit-field">
                    <span>{{ t('episode.asset.sceneLightField') }}</span>
                    <textarea
                      v-model="assetDetailDraft.lighting"
                      class="textarea asset-detail-textarea"
                      rows="5"
                      :placeholder="t('episode.asset.sceneLightPlaceholder')"
                    />
                  </label>
                </div>

              </section>
            </div>

            <section class="asset-detail-prompt-panel">
              <div class="asset-detail-section-title">
                <span>{{ assetDetail.type === 'character' ? t('episode.asset.finalPromptTurnaround') : assetDetail.type === 'scene' ? t('episode.asset.finalPromptFixed') : t('episode.asset.finalPromptWhiteBg') }}</span>
                <div class="asset-detail-prompt-head-actions">
                  <button
                    class="btn btn-sm"
                    :disabled="isGeneratingPrompt(assetDetail.type, assetDetail.item.id) || isAssetImagePending(assetDetail.type, assetDetail.item.id)"
                    @click="genAssetFinalPrompt"
                  >
                    <Loader2 v-if="isGeneratingPrompt(assetDetail.type, assetDetail.item.id)" :size="11" class="animate-spin" />
                    {{ isGeneratingPrompt(assetDetail.type, assetDetail.item.id) ? t('episode.asset.generating') : (assetFinalPrompt ? t('episode.asset.regenPrompt') : t('episode.asset.genPrompt')) }}
                  </button>
                  <span :class="['asset-detail-state', assetFinalPrompt && 'is-ready']">
                    {{ assetFinalPrompt ? t('episode.asset.ready') : t('episode.asset.todo') }}
                  </span>
                  <button
                    v-if="assetPromptDraft"
                    class="btn btn-ghost btn-sm asset-detail-copy-btn"
                    @click="copyAssetFinalPrompt"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    {{ t('common.copy') }}
                  </button>
                </div>
              </div>
              <textarea
                :value="assetPromptDraft"
                @input="onAssetPromptInput"
                class="textarea asset-detail-prompt-textarea"
                rows="5"
                :placeholder="assetDetail.type === 'character'
                  ? t('episode.asset.promptPlaceholderChar')
                  : assetDetail.type === 'scene'
                    ? t('episode.asset.promptPlaceholderScene')
                    : t('episode.asset.promptPlaceholderProp')"
              />
              <p class="asset-detail-prompt-hint">
                {{ assetDetail.type === 'character'
                  ? t('episode.asset.promptHintChar')
                  : assetDetail.type === 'scene'
                    ? t('episode.asset.promptHintScene')
                    : t('episode.asset.promptHintProp') }}
              </p>
              <label class="switch-row asset-detail-autoimg">
                <input
                  type="checkbox"
                  class="sr-only"
                  :checked="autoImageAfterPrompt"
                  @change="toggleAutoImageAfterPrompt"
                />
                <span class="switch" :class="{ on: autoImageAfterPrompt }"></span>
                <span class="field-hint switch-hint">{{ t('episode.asset.autoImageLabel') }}</span>
                <span class="field-hint switch-hint">{{ t('episode.asset.autoImageHint') }}</span>
              </label>
            </section>
          </div>

          <footer class="dialog-foot asset-detail-foot">
            <div v-if="assetDetail.open && assetDetail.item && assetProgressOf(assetDetail.type, assetDetail.item.id)" class="asset-progress is-dialog" :class="'is-' + (assetProgressOf(assetDetail.type, assetDetail.item.id)?.stage || 'queued')">
              <div class="asset-progress-top">
                <span class="asset-progress-label">{{ assetProgressStageLabel(assetDetail.type, assetDetail.item.id) }}</span>
                <span class="asset-progress-pct mono">{{ assetProgressPercent(assetDetail.type, assetDetail.item.id) }}%</span>
              </div>
              <div class="asset-progress-track" role="progressbar" :aria-valuenow="assetProgressPercent(assetDetail.type, assetDetail.item.id)" aria-valuemin="0" aria-valuemax="100">
                <div class="asset-progress-fill" :style="{ width: assetProgressPercent(assetDetail.type, assetDetail.item.id) + '%' }" />
              </div>
            </div>
            <div class="asset-detail-secondary-actions">
              <button class="btn btn-danger" @click="askDeleteAsset(assetDetail.type, assetDetail.item)">{{ t('common.delete') }}</button>
              <button class="btn" @click="closeAssetDetail">{{ t('common.close') }}</button>
            </div>
            <div class="asset-detail-primary-actions">
              <button
                class="btn"
                :disabled="isUploadingAsset(assetDetail.type, assetDetail.item.id)"
                @click="uploadAssetImage(assetDetail.type, assetDetail.item.id)"
              >
                <Loader2 v-if="isUploadingAsset(assetDetail.type, assetDetail.item.id)" :size="11" class="animate-spin" />
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                {{ t('episode.asset.uploadImage') }}
              </button>
              <button
                v-if="assetDetail.type === 'character'"
                class="btn"
                :disabled="isPendingCharImage(assetDetail.item.id)"
                @click="genCharImg(assetDetail.item.id)"
              >
                {{ assetImageSrc(assetDetail.item) ? t('episode.asset.regenPortrait') : (isPendingCharImage(assetDetail.item.id) ? t('episode.asset.generating') : t('episode.asset.genPortrait')) }}
              </button>
              <button
                v-else-if="assetDetail.type === 'scene'"
                class="btn"
                :disabled="isPendingSceneImage(assetDetail.item.id)"
                @click="genSceneImg(assetDetail.item.id)"
              >
                {{ assetImageSrc(assetDetail.item) ? t('episode.asset.regenScene') : (isPendingSceneImage(assetDetail.item.id) ? t('episode.asset.generating') : t('episode.asset.genScene')) }}
              </button>
              <button
                v-else-if="assetDetail.type === 'prop'"
                class="btn"
                :disabled="isPendingPropImage(assetDetail.item.id)"
                @click="genPropImg(assetDetail.item.id)"
              >
                {{ assetImageSrc(assetDetail.item) ? t('episode.asset.regenProp') : (isPendingPropImage(assetDetail.item.id) ? t('episode.asset.generating') : t('episode.asset.genProp')) }}
              </button>
              <button class="btn btn-primary" :disabled="savingAssetDetail" @click="saveAssetDetail">
                <Loader2 v-if="savingAssetDetail" :size="12" class="animate-spin" />
                {{ t('episode.asset.saveChanges') }}
              </button>
            </div>
          </footer>
        </section>
      </div>

      <div v-if="imageViewer.open && imageViewer.src" class="overlay image-viewer-overlay" @click.self="closeImageViewer">
        <div class="dialog image-viewer-dialog">
          <div class="image-viewer-head">
            <div class="image-viewer-title">{{ imageViewer.title || t('episode.viewer.imagePreview') }}</div>
            <button class="btn btn-ghost btn-icon" @click="closeImageViewer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="image-viewer-body">
            <img :src="imageViewer.src" :alt="imageViewer.title || t('episode.viewer.imagePreview')" class="image-viewer-img" />
          </div>
        </div>
      </div>

      <div v-if="previewShot" class="overlay image-viewer-overlay" @click.self="previewShot = null">
        <div class="dialog image-viewer-dialog merge-viewer-dialog">
          <div class="image-viewer-head">
            <div class="image-viewer-title">{{ t('episode.export.shotPreview', { n: shotNumberOf(previewShot) }) }}</div>
            <span v-if="previewShot.duration" class="dim" style="font-size:11px">{{ previewShot.duration }}s</span>
            <a :href="'/' + getVideoUrl(previewShot)" download class="btn btn-sm" style="margin-left:auto">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {{ t('common.download') }}
            </a>
            <button class="btn btn-ghost btn-icon" @click="previewShot = null">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="merge-viewer-body">
            <video
              :key="previewShot.id"
              :src="'/' + getVideoUrl(previewShot)"
              controls
              autoplay
              playsinline
              class="merge-viewer-video"
            />
          </div>
        </div>
      </div>

      <div v-if="activeMerge" class="overlay image-viewer-overlay" @click.self="activeMerge = null">
        <div class="dialog image-viewer-dialog merge-viewer-dialog">
          <div class="image-viewer-head">
            <div class="image-viewer-title">{{ t('episode.viewer.filmPreview') }}</div>
            <span class="dim" style="font-size:11px">{{ formatHistoryTime(activeMerge.created_at) }}<template v-if="activeMerge.duration"> · {{ activeMerge.duration }}s</template></span>
            <a :href="'/' + activeMerge.merged_url" download class="btn btn-sm" style="margin-left:auto">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {{ t('episode.viewer.downloadFilm') }}
            </a>
            <button class="btn btn-ghost btn-icon" @click="activeMerge = null">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="merge-viewer-body">
            <video
              :key="activeMerge.id"
              :src="'/' + activeMerge.merged_url"
              controls
              autoplay
              playsinline
              class="merge-viewer-video"
            />
          </div>
        </div>
      </div>

      <div v-if="assetCreate.open" class="overlay" @click.self="assetCreate.open = false">
        <div class="dialog asset-create-dialog">
          <header class="dialog-head">
            <h2 class="dialog-title">{{ t('episode.create.title', { type: assetCreateTypeLabel }) }}</h2>
            <button class="btn btn-ghost btn-icon" @click="assetCreate.open = false">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </header>
          <div class="dialog-body asset-create-body">
            <template v-if="assetCreate.type === 'character'">
              <label class="field"><span class="field-label">{{ t('episode.create.name') }}</span><input v-model="assetCreateDraft.name" class="input" :placeholder="t('episode.create.namePlaceholderChar')" /></label>
              <label class="field"><span class="field-label">{{ t('episode.create.roleField') }}</span><input v-model="assetCreateDraft.role" class="input" :placeholder="t('episode.create.rolePlaceholder')" /></label>
              <label class="field"><span class="field-label">{{ t('episode.asset.appearanceField') }}</span><textarea v-model="assetCreateDraft.appearance" class="textarea" rows="3" :placeholder="t('episode.create.appearancePlaceholder')" /></label>
              <label class="field"><span class="field-label">{{ t('episode.asset.stylingField') }}</span><textarea v-model="assetCreateDraft.styling" class="textarea" rows="2" :placeholder="t('episode.create.stylingPlaceholder')" /></label>
            </template>
            <template v-else-if="assetCreate.type === 'scene'">
              <label class="field"><span class="field-label">{{ t('episode.create.location') }}</span><input v-model="assetCreateDraft.location" class="input" :placeholder="t('episode.create.locationPlaceholder')" /></label>
              <label class="field"><span class="field-label">{{ t('episode.create.time') }}</span><input v-model="assetCreateDraft.time" class="input" :placeholder="t('episode.create.timePlaceholder')" /></label>
              <label class="field"><span class="field-label">{{ t('episode.asset.sceneDescField') }}</span><textarea v-model="assetCreateDraft.prompt" class="textarea" rows="3" :placeholder="t('episode.create.sceneDescPlaceholder')" /></label>
              <label class="field"><span class="field-label">{{ t('episode.asset.sceneLightField') }}</span><input v-model="assetCreateDraft.lighting" class="input" :placeholder="t('episode.create.lightPlaceholder')" /></label>
            </template>
            <template v-else>
              <label class="field"><span class="field-label">{{ t('episode.create.name') }}</span><input v-model="assetCreateDraft.name" class="input" :placeholder="t('episode.create.namePlaceholderProp')" /></label>
              <label class="field"><span class="field-label">{{ t('episode.create.typeField') }}</span><input v-model="assetCreateDraft.type" class="input" :placeholder="t('episode.create.typePlaceholder')" /></label>
              <label class="field"><span class="field-label">{{ t('episode.asset.appearanceOfObject') }}</span><textarea v-model="assetCreateDraft.description" class="textarea" rows="3" :placeholder="t('episode.create.appearanceOnlyPlaceholder')" /></label>
            </template>
          </div>
          <footer class="dialog-foot">
            <button class="btn" @click="assetCreate.open = false">{{ t('common.cancel') }}</button>
            <button class="btn btn-primary" :disabled="assetCreate.saving" @click="saveAssetCreate">
              <Loader2 v-if="assetCreate.saving" :size="12" class="animate-spin" />
              {{ t('common.add') }}
            </button>
          </footer>
        </div>
      </div>

      <div v-if="batchVideoConfirm.open" class="overlay" @click.self="batchVideoConfirm.open = false">
        <div class="dialog batch-video-dialog">
          <header class="dialog-head">
            <h2 class="dialog-title">{{ t('episode.vid.confirmTitle') }}</h2>
            <button class="btn btn-ghost btn-icon" @click="batchVideoConfirm.open = false">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </header>
          <div class="dialog-body batch-video-body">
            <div class="batch-video-row"><span>{{ t('episode.vid.confirmShots') }}</span><strong>{{ t('episode.vid.confirmShotsValue', { n: batchVideoConfirm.targets.length }) }}</strong></div>
            <div class="batch-video-row"><span>{{ t('episode.vid.confirmTotal') }}</span><strong>{{ t('episode.vid.confirmApprox', { n: batchVideoTotalDuration }) }}</strong></div>
            <div class="batch-video-row"><span>{{ t('episode.vid.confirmModel') }}</span><strong>{{ effectiveVideoModelLabel || t('episode.vid.defaultModel') }}</strong></div>
            <div class="batch-video-row"><span>{{ t('episode.vid.confirmResolution') }}</span><strong>{{ episodeResolutionLabel }}</strong></div>
            <p class="batch-video-note">{{ t('episode.vid.confirmNote') }}</p>
          </div>
          <footer class="dialog-foot">
            <button class="btn" @click="batchVideoConfirm.open = false">{{ t('common.cancel') }}</button>
            <button class="btn btn-primary" @click="confirmBatchVideos">{{ t('episode.vid.confirmStart', { n: batchVideoConfirm.targets.length }) }}</button>
          </footer>
        </div>
      </div>

      <ConfirmDialog
        :open="assetDelete.open"
        :title="t('episode.delete.title', { type: assetDeleteTypeLabel })"
        :message="t('episode.delete.message', { type: assetDeleteTypeLabel, name: assetDeleteName })"
        :loading="assetDelete.loading"
        @confirm="confirmDeleteAsset"
        @cancel="assetDelete.open = false"
      />
    </main>
    </div>
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'
import {
  Users, FileText, FolderKanban, Clapperboard, Download, Loader2,
  Plus, X, ListTodo,
} from 'lucide-vue-next'
import { api, dramaAPI, episodeAPI, storyboardAPI, characterAPI, sceneAPI, propAPI, taskAPI, mergeAPI, aiConfigAPI, uploadAPI } from '~/composables/useApi'
import { useAgent } from '~/composables/useAgent'
import { toastError, mapError, MODERATION_RE } from '~/composables/useToast'
import LocaleSwitcher from '~/components/LocaleSwitcher.vue'

definePageMeta({ layout: 'studio' })

const { t } = useI18n()

const route = useRoute()
const dramaId = Number(route.params.id)
const episodeNumber = Number(route.params.episodeNumber)

const drama = ref(null), episode = ref(null), chars = ref([]), scenes = ref([]), propItems = ref([]), sbs = ref([]), mergeData = ref(null)
// workbench panel position memory (isolated per episode): restore the last step only on page reload;
// entering from list/detail always defaults to"script"panel
const PANEL_STORE_KEY = `huobao:workbench:panel:${dramaId}:${episodeNumber}`
const isPageReload = (() => {
  try { return performance.getEntriesByType('navigation')[0]?.type === 'reload' } catch { return false }
})()
const storedPanel = (() => {
  if (!isPageReload) return null
  try { return JSON.parse(localStorage.getItem(PANEL_STORE_KEY) || 'null') } catch { return null }
})()
// on first refresh, if the panel position was restored, skip content-based auto reset scriptStep
let panelRestored = !!storedPanel
const panel = ref(['production', 'export'].includes(storedPanel?.panel) ? storedPanel.panel : 'script')
const { running: rn, runningType: rt, run: runAgent } = useAgent()

const localRaw = ref(''), localScript = ref('')
const rawContent = computed(() => episode.value?.content || '')
const scriptContent = computed(() => episode.value?.script_content || episode.value?.scriptContent || '')
const epId = computed(() => episode.value?.id || 0)
const rawLen = computed(() => localRaw.value.replace(/\s/g, '').length || 0)
const scriptLen = computed(() => localScript.value.replace(/\s/g, '').length || 0)

// ===== merge export:shot selection + merged video list =====
const exportSelectedIds = ref([]) // selected shot ids
const exportMerges = ref([])      // merged video (merge record) list
let exportSelTouched = false      // after the user changed the selection manually, no longer auto-select all

const exportReadyIds = computed(() => sbs.value.filter(s => hasVid(s)).map(s => s.id))
const exportSelectedReadyIds = computed(() => exportSelectedIds.value.filter(id => exportReadyIds.value.includes(id)))

watch(exportReadyIds, (ids) => {
  if (exportSelTouched) {
    exportSelectedIds.value = exportSelectedIds.value.filter(id => ids.includes(id))
  } else {
    exportSelectedIds.value = [...ids]
  }
})

function isExportSelected(id) { return exportSelectedIds.value.includes(id) }
function toggleExportSelect(sb) {
  if (!hasVid(sb)) return
  exportSelTouched = true
  exportSelectedIds.value = isExportSelected(sb.id)
    ? exportSelectedIds.value.filter(x => x !== sb.id)
    : [...exportSelectedIds.value, sb.id]
}
function toggleSelectAllExport() {
  exportSelTouched = true
  exportSelectedIds.value = exportSelectedReadyIds.value.length === exportReadyIds.value.length ? [] : [...exportReadyIds.value]
}

async function loadExportMerges() {
  if (!epId.value) return
  try { exportMerges.value = await mergeAPI.list(epId.value) || [] } catch { /* silent */ }
}

const scriptStep = ref(storedPanel ? (storedPanel.scriptStep === 0 ? 0 : 1) : 0)
// legacy local storage 'storyboard' sub-step merged into 'videos' (video production)
const storedProdTab = storedPanel?.prodTab === 'storyboard' ? 'videos' : storedPanel?.prodTab
const prodTab = ref(['assets', 'videos'].includes(storedProdTab) ? storedProdTab : 'assets')
// panel position changes are persisted immediately
watch([panel, scriptStep, prodTab], ([p, s, pt]) => {
  try { localStorage.setItem(PANEL_STORE_KEY, JSON.stringify({ panel: p, scriptStep: s, prodTab: pt })) } catch { /* silent */ }
})
// ===== video production three-column widths: drag to resize + global persistence (double-click the divider to restore defaults) =====
const VIDEO_COL_STORE_KEY = 'huobao:workbench:video-cols'
const VIDEO_COL_DEFAULTS = { left: 236, right: 340 }
const VIDEO_COL_LIMITS = { left: [180, 420], right: [260, 560] }
const storedVideoCols = (() => {
  try {
    const c = JSON.parse(localStorage.getItem(VIDEO_COL_STORE_KEY) || 'null')
    return c && typeof c === 'object' ? c : null
  } catch { return null }
})()
const clampVideoCol = (which, w) => Math.min(VIDEO_COL_LIMITS[which][1], Math.max(VIDEO_COL_LIMITS[which][0], Math.round(w)))
const videoLeftW = ref(clampVideoCol('left', Number(storedVideoCols?.left) || VIDEO_COL_DEFAULTS.left))
const videoRightW = ref(clampVideoCol('right', Number(storedVideoCols?.right) || VIDEO_COL_DEFAULTS.right))
watch([videoLeftW, videoRightW], ([l, r]) => {
  try { localStorage.setItem(VIDEO_COL_STORE_KEY, JSON.stringify({ left: l, right: r })) } catch { /* silent */ }
})
function startVideoColDrag(which, e) {
  if (e.button !== 0) return
  e.preventDefault()
  const target = e.currentTarget
  const startX = e.clientX
  const startW = which === 'left' ? videoLeftW.value : videoRightW.value
  const onMove = (ev) => {
    const dx = ev.clientX - startX
    const w = clampVideoCol(which, which === 'left' ? startW + dx : startW - dx)
    if (which === 'left') videoLeftW.value = w
    else videoRightW.value = w
  }
  const onUp = () => {
    target.removeEventListener('pointermove', onMove)
    target.removeEventListener('pointerup', onUp)
    target.removeEventListener('pointercancel', onUp)
    document.body.classList.remove('is-video-col-dragging')
  }
  document.body.classList.add('is-video-col-dragging')
  target.addEventListener('pointermove', onMove)
  target.addEventListener('pointerup', onUp)
  target.addEventListener('pointercancel', onUp)
  target.setPointerCapture?.(e.pointerId)
}
const activeExtractTab = ref('characters')
const prodTabIdx = computed({
  get: () => prodTabDefs.value.findIndex(d => d.id === prodTab.value),
  set: (v) => { prodTab.value = prodTabDefs.value[v]?.id || 'assets' },
})
const imageConfigs = ref([])
const videoConfigs = ref([])
const textConfigs = ref([])
// optional model for generation: empty string = follow the configured default (models[0]); selection persisted to localStorage, retained after refresh
const MODEL_STORE_KEYS = { chat: 'huobao:model:chat', image: 'huobao:model:image', video: 'huobao:model:video' }
function readStoredModel(key, legacyKey = '') {
  try { return localStorage.getItem(key) || (legacyKey && localStorage.getItem(legacyKey)) || '' } catch { return '' }
}
// Top-bar text model: applies to all Chat Agent calls (rewrite/extraction/storyboard split/video prompt/final prompt); empty string = follow the configured default
const chatModel = ref(readStoredModel(MODEL_STORE_KEYS.chat, 'huobao:model:rewrite'))
const imageModel = ref(readStoredModel(MODEL_STORE_KEYS.image))
const videoModel = ref(readStoredModel(MODEL_STORE_KEYS.video))
function persistModel(modelRef, key) {
  watch(modelRef, v => {
    try { v ? localStorage.setItem(key, v) : localStorage.removeItem(key) } catch {}
  })
}
persistModel(chatModel, MODEL_STORE_KEYS.chat)
persistModel(imageModel, MODEL_STORE_KEYS.image)
persistModel(videoModel, MODEL_STORE_KEYS.video)
// Left sidebar menu collapse/expand: collapse into a narrow icon rail to give the content area more room, persisted to localStorage
const SIDEBAR_COLLAPSED_KEY = 'huobao:sidebar-collapsed'
const sidebarCollapsed = ref((() => {
  try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1' } catch { return false }
})())
function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
  try {
    sidebarCollapsed.value
      ? localStorage.setItem(SIDEBAR_COLLAPSED_KEY, '1')
      : localStorage.removeItem(SIDEBAR_COLLAPSED_KEY)
  } catch { /* silent */ }
}
/** Top-bar text model override param: undefined when not selected, backend falls back to the Agent/text config default */
function chatModelOverride() { return bareModelName(chatModel.value) || undefined }
function chatConfigId() { return ownerConfigId(textModelOptions.value, chatModel.value) }
const pendingCharImageIds = ref([])
const pendingSceneImageIds = ref([])
const pendingPropImageIds = ref([])
// ─── Progress realtime per-card aset ─────────────────────────────────────
// Provider gambar tidak mengembalikan persen; progress dihitung dari fase +
// elapsed polling agar tiap card terbaca "sampai mana":
// prompt(10%) → antre(25%) → generating(30→92% naik per detik) → done(100%).
const assetProgressMap = ref({})
function assetProgressKey(type, id) { return `${type}:${id}` }
function setAssetProgress(type, id, patch) {
  const key = assetProgressKey(type, id)
  const prev = assetProgressMap.value[key] || { stage: 'queued', percent: 5, startedAt: Date.now(), elapsed: 0, error: '' }
  assetProgressMap.value = { ...assetProgressMap.value, [key]: { ...prev, ...patch } }
}
function clearAssetProgress(type, id) {
  const key = assetProgressKey(type, id)
  if (!(key in assetProgressMap.value)) return
  const next = { ...assetProgressMap.value }
  delete next[key]
  assetProgressMap.value = next
}
function assetProgressOf(type, id) {
  return assetProgressMap.value[assetProgressKey(type, id)] || null
}
function assetProgressPercent(type, id) {
  const p = assetProgressOf(type, id)
  if (!p) return 0
  if (p.stage === 'done') return 100
  if (p.stage === 'failed') return p.percent || 100
  if (p.stage === 'generating') {
    // Estimasi: gambar biasanya 30–120 dtk; naik mulus 30→92% lalu mentok sampai selesai.
    // (elapsed disimpan per tick polling; fallback ke startedAt bila tick belum jalan)
    const elapsed = Math.max(p.elapsed || 0, p.startedAt ? (Date.now() - p.startedAt) / 1000 : 0)
    return Math.min(92, Math.round(30 + Math.min(elapsed / 120, 1) * 62))
  }
  if (p.stage === 'prompt') return 12
  return 25
}
function assetProgressStageLabel(type, id) {
  const p = assetProgressOf(type, id)
  if (!p) return ''
  if (p.stage === 'prompt') return t('episode.asset.stagePrompt')
  if (p.stage === 'queued') {
    return (p.queuePos && p.queueTotal)
      ? t('episode.asset.queuePos', { pos: p.queuePos, total: p.queueTotal })
      : t('episode.asset.stageQueued')
  }
  if (p.stage === 'generating') return t('episode.asset.stageGenerating', { n: Math.round(p.elapsed || 0) })
  if (p.stage === 'done') return t('episode.asset.stageDone')
  if (p.stage === 'failed') return p.error || t('episode.asset.stageFailed')
  return ''
}
let assetProgressTicker = null
function startAssetProgressTicker() {
  if (assetProgressTicker) return
  assetProgressTicker = setInterval(() => {
    if (!Object.keys(assetProgressMap.value).length) return
    // Picu re-render agar persen berbasis elapsed naik tiap detik tanpa request tambahan.
    assetProgressMap.value = { ...assetProgressMap.value }
    if (typeof videoProgressMap !== 'undefined' && Object.keys(videoProgressMap.value || {}).length) {
      videoProgressMap.value = { ...videoProgressMap.value }
    }
  }, 1000)
}
startAssetProgressTicker()

// ─── Antrean pembuatan gambar aset: SATU PER SATU (FIFO) ─────────────────
// Semua generate gambar aset (karakter/adegan/properti, satuan maupun batch,
// dari card maupun dialog) masuk antrean ini. Worker memproses satu per satu
// sampai selesai/gagal sebelum lanjut ke berikutnya — tidak ada lagi N sesi
// agent teks + N request gambar yang ditembak serentak. Setiap item antre
// selalu punya indikator progres (posisi antre / tahap / elapsed).
const assetQueue = ref([]) // [{ kind, id }] menunggu giliran
const assetQueueActive = ref(null) // { kind, id } sedang diproses
function isAssetQueued(kind, id) { return assetQueue.value.some(j => j.kind === kind && j.id === id) }
function isAssetJobActive(kind, id) {
  return !!assetQueueActive.value && assetQueueActive.value.kind === kind && assetQueueActive.value.id === id
}
function assetPendingRef(kind) {
  return kind === 'character' ? pendingCharImageIds : kind === 'scene' ? pendingSceneImageIds : pendingPropImageIds
}
function assetDisplayName(kind, id) {
  if (kind === 'character') return chars.value.find(x => x.id === id)?.name || `#${id}`
  if (kind === 'scene') return scenes.value.find(x => x.id === id)?.location || `#${id}`
  return propItems.value.find(x => x.id === id)?.name || `#${id}`
}
/** Tulis ulang posisi antre (Antre #pos dari total) ke semua item menunggu */
function refreshAssetQueueProgress() {
  const activeCount = assetQueueActive.value ? 1 : 0
  const total = assetQueue.value.length + activeCount
  assetQueue.value.forEach((j, i) => {
    setAssetProgress(j.kind, j.id, { stage: 'queued', queuePos: i + 1 + activeCount, queueTotal: total, elapsed: 0, error: '' })
  })
}
/**
 * Masukkan aset ke antrean. Mengembalikan daftar { id, pos } yang baru ditambahkan
 * (kosong bila semuanya sudah dalam antrean / sedang diproses).
 */
function enqueueAssetJobs(kind, ids) {
  const pendingRef = assetPendingRef(kind)
  const added = []
  for (const id of ids) {
    if (isAssetQueued(kind, id) || isAssetJobActive(kind, id)) continue
    assetQueue.value.push({ kind, id })
    if (!pendingRef.value.includes(id)) pendingRef.value.push(id)
    added.push(id)
  }
  refreshAssetQueueProgress()
  // Tandai posisi tiap item baru (pos dihitung setelah semua dimasukkan)
  const result = added.map(id => {
    const idx = assetQueue.value.findIndex(j => j.kind === kind && j.id === id)
    return { id, pos: idx + 1 + (assetQueueActive.value ? 1 : 0) }
  })
  pumpAssetQueue()
  return result
}
let assetQueuePumping = false
async function pumpAssetQueue() {
  if (assetQueuePumping) return
  assetQueuePumping = true
  try {
    while (assetQueue.value.length) {
      const job = assetQueue.value.shift()
      assetQueueActive.value = job
      refreshAssetQueueProgress()
      try {
        await runAssetJob(job.kind, job.id)
      } catch (e) { /* runAssetJob sudah mencatat failed + toast */ }
      assetQueueActive.value = null
      refreshAssetQueueProgress()
    }
  } finally {
    assetQueuePumping = false
  }
}
function assetFindRec(kind, id) {
  return kind === 'character'
    ? chars.value.find(c => c.id === id)
    : kind === 'scene'
      ? scenes.value.find(s => s.id === id)
      : propItems.value.find(p => p.id === id)
}
/** Satu job aset: prompt akhir (teks) → request gambar → tunggu selesai. Awaitable. */
async function runAssetJob(kind, id) {
  const pendingRef = assetPendingRef(kind)
  const startedAt = Date.now()
  try {
    const rec = assetFindRec(kind, id)
    if (rec && !(rec.final_prompt || rec.finalPrompt)) {
      setAssetProgress(kind, id, { stage: 'prompt', startedAt, elapsed: 0, error: '' })
      try {
        await ensureAssetPrompt(kind, id)
      } catch {} // prompt gagal tidak menghentikan: backend fallback sebelum generate gambar
    }
    const total = assetQueue.value.length + 1
    setAssetProgress(kind, id, { stage: 'queued', queuePos: 1, queueTotal: total, startedAt, elapsed: 0 })
    const api = kind === 'character' ? characterAPI : kind === 'scene' ? sceneAPI : propAPI
    const res = await api.generateImage(id, epId.value, bareModelName(imageModel.value) || undefined, ownerConfigId(imageModelOptions.value, imageModel.value), chatModelOverride(), chatConfigId())
    await refresh()
    const taskIds = res?.image_generation_id ? [Number(res.image_generation_id)] : []
    return await watchAssetImages(taskIds, [id], kind)
  } catch (e) {
    setAssetProgress(kind, id, { stage: 'failed', error: e?.message || String(e || ''), elapsed: Math.round((Date.now() - startedAt) / 1000) })
    toastError(e)
    return false
  } finally {
    pendingRef.value = pendingRef.value.filter(item => item !== id)
  }
}
/** Batalkan item yang masih menunggu (yang sedang berjalan diselesaikan) */
function cancelAssetQueue() {
  const waiting = [...assetQueue.value]
  if (!waiting.length) return
  assetQueue.value = []
  const byKind = { character: [], scene: [], prop: [] }
  for (const j of waiting) {
    ;(byKind[j.kind] || (byKind[j.kind] = [])).push(j.id)
    clearAssetProgress(j.kind, j.id)
  }
  pendingCharImageIds.value = pendingCharImageIds.value.filter(id => !byKind.character.includes(id))
  pendingSceneImageIds.value = pendingSceneImageIds.value.filter(id => !byKind.scene.includes(id))
  pendingPropImageIds.value = pendingPropImageIds.value.filter(id => !byKind.prop.includes(id))
  toast.info(t('episode.asset.queueCancelled', { n: waiting.length }))
}
const assetQueueStatusText = computed(() => {
  const parts = []
  if (assetQueueActive.value) {
    parts.push(t('episode.asset.queueActive', {
      name: assetDisplayName(assetQueueActive.value.kind, assetQueueActive.value.id),
    }))
  }
  if (assetQueue.value.length) parts.push(t('episode.asset.queueWaiting', { n: assetQueue.value.length }))
  return parts.join(' · ')
})
const pendingVideoIds = ref([])
const failedVideoMessages = ref({})
// task list panel: right drawer triggered by the top-bar button, grouped by episode sys_task + video_merges
const genTasks = ref([])
const genMerges = ref([])
const taskDrawer = ref(false)
let genTasksTimer = null

function openTaskDrawer() {
  taskDrawer.value = true
  loadGenTasks()
}
function closeTaskDrawer() {
  taskDrawer.value = false
}
const imageViewer = ref({ open: false, src: '', title: '' })
const activeMerge = ref(null) // merge record playing in the full preview dialog
const burnSubtitles = ref(false) // whether to burn dialogue into subtitles when merging
const previewShot = ref(null) // storyboard playing in the export page shot preview dialog
function shotNumberOf(sb) {
  const i = sbs.value.findIndex(s => s.id === sb?.id)
  return i >= 0 ? i + 1 : 0
}
// export step completion = manually marked by the user (episodes.status = 'completed'), no longer derived from the latest merge record
const exportDone = computed(() => episode.value?.status === 'completed')
async function toggleExportDone() {
  if (!epId.value) return
  const status = exportDone.value ? 'active' : 'completed'
  try {
    await episodeAPI.update(epId.value, { status })
    if (episode.value) episode.value.status = status
    toast.success(status === 'completed' ? t('episode.export.markedDoneToast') : t('episode.export.unmarkDoneToast'))
  } catch (e) {
    toastError(e)
  }
}
const assetDetail = ref({ open: false, type: '', item: null })
const assetDetailDraft = ref({ appearance: '', styling: '', prompt: '', lighting: '', description: '' })
// manual edit of the final prompt: dirty submitted on save only when, avoid clearing on a no-change save Agent generated prompt
const assetPromptDraft = ref('')
const assetPromptDirty = ref(false)
const savingAssetDetail = ref(false)

// Opsi: setelah prompt aset berhasil dibuat, langsung buat gambarnya juga (persisted per perangkat)
const AUTO_IMAGE_AFTER_PROMPT_KEY = 'hbao_auto_image_after_prompt'
const autoImageAfterPrompt = ref((() => {
  try { return localStorage.getItem(AUTO_IMAGE_AFTER_PROMPT_KEY) === '1' } catch { return false }
})())
function toggleAutoImageAfterPrompt() {
  autoImageAfterPrompt.value = !autoImageAfterPrompt.value
  try { localStorage.setItem(AUTO_IMAGE_AFTER_PROMPT_KEY, autoImageAfterPrompt.value ? '1' : '0') } catch {}
}

function isPendingCharImage(id) {
  return pendingCharImageIds.value.includes(id)
}

function openImageViewer(src, title = '') {
  if (!src) return
  imageViewer.value = { open: true, src, title }
}

function closeImageViewer() {
  imageViewer.value = { open: false, src: '', title: '' }
}

function openAssetDetail(type, item) {
  if (!item) return
  assetDetail.value = { open: true, type, item }
  assetDetailDraft.value = {
    appearance: item.appearance || '',
    styling: item.styling || '',
    prompt: item.prompt || (type === 'prop' ? '' : item.description) || '',
    lighting: item.lighting || '',
    description: item.description || '',
  }
  assetPromptDraft.value = item.final_prompt || item.finalPrompt || ''
  assetPromptDirty.value = false
}

function closeAssetDetail() {
  assetDetail.value = { open: false, type: '', item: null }
  assetDetailDraft.value = { appearance: '', styling: '', prompt: '', lighting: '', description: '' }
  assetPromptDraft.value = ''
  assetPromptDirty.value = false
}

// ─── manually add asset ────────────────────────────────────────────
// short type label evaluated at render time (not frozen at module level), logic always uses kind code
const assetKindLabelMap = computed(() => ({
  character: t('common.role'),
  scene: t('common.scene'),
  prop: t('common.prop'),
}))
function assetKindLabel(type) {
  return assetKindLabelMap.value[type] || t('episode.asset.fallbackType')
}
const assetCreate = ref({ open: false, type: 'character', saving: false })
const assetCreateDraft = ref({})
const assetCreateTypeLabel = computed(() => assetKindLabel(assetCreate.value.type))

function openAssetCreate(type) {
  assetCreateDraft.value = { name: '', role: '', appearance: '', styling: '', location: '', time: '', prompt: '', lighting: '', type: '', description: '' }
  assetCreate.value = { open: true, type, saving: false }
}

async function saveAssetCreate() {
  const d = assetCreateDraft.value
  const type = assetCreate.value.type
  if (assetCreate.value.saving) return
  if (type === 'scene' ? !d.location?.trim() : !d.name?.trim()) {
    toast.warning(type === 'scene' ? t('episode.create.locationRequired') : t('episode.create.nameRequired'))
    return
  }
  assetCreate.value.saving = true
  try {
    const base = { drama_id: dramaId, episode_id: epId.value }
    if (type === 'character') await characterAPI.create({ ...base, name: d.name, role: d.role, appearance: d.appearance, styling: d.styling })
    else if (type === 'scene') await sceneAPI.create({ ...base, location: d.location, time: d.time, prompt: d.prompt, lighting: d.lighting })
    else await propAPI.create({ ...base, name: d.name, type: d.type, description: d.description })
    toast.success(t('episode.create.created', { type: assetCreateTypeLabel.value }))
    assetCreate.value.open = false
    await refresh()
  } catch (e) {
    toastError(e)
  } finally {
    assetCreate.value.saving = false
  }
}

// ─── delete asset ────────────────────────────────────────────────
const assetDelete = ref({ open: false, type: '', item: null, loading: false })
const assetDeleteTypeLabel = computed(() => assetKindLabel(assetDelete.value.type))
const assetDeleteName = computed(() => assetDelete.value.item?.name || assetDelete.value.item?.location || '')

function askDeleteAsset(type, item) {
  assetDelete.value = { open: true, type, item, loading: false }
}

async function confirmDeleteAsset() {
  const { type, item } = assetDelete.value
  if (!item || assetDelete.value.loading) return
  assetDelete.value.loading = true
  try {
    if (type === 'character') await characterAPI.del(item.id)
    else if (type === 'scene') await sceneAPI.del(item.id)
    else await propAPI.del(item.id)
    toast.success(t('episode.delete.deleted', { type: assetDeleteTypeLabel.value }))
    assetDelete.value.open = false
    if (assetDetail.value.open && assetDetail.value.type === type && assetDetail.value.item?.id === item.id) closeAssetDetail()
    await refresh()
  } catch (e) {
    toastError(e)
  } finally {
    assetDelete.value.loading = false
  }
}

function onAssetPromptInput(event) {
  assetPromptDraft.value = event.target.value
  assetPromptDirty.value = true
}

const assetFinalPrompt = computed(() => {
  const item = assetDetail.value?.item
  return item?.final_prompt || item?.finalPrompt || ''
})

/** sync the generated final prompt to list and dialog items */
function applyFinalPrompt(type, id, fp) {
  const patch = { final_prompt: fp, finalPrompt: fp }
  const list = type === 'character' ? chars.value : type === 'scene' ? scenes.value : propItems.value
  const target = list.find(x => x.id === id)
  if (target) Object.assign(target, patch)
  if (assetDetail.value.open && assetDetail.value.type === type && assetDetail.value.item?.id === id) {
    Object.assign(assetDetail.value.item, patch)
  }
}

const generatingPromptKeys = ref([])

function isGeneratingPrompt(type, id) {
  return generatingPromptKeys.value.includes(`${type}:${id}`)
}

/** Whether this asset image is in the outer "generate" flow (including prompt and image stages) */
function isAssetImagePending(type, id) {
  return type === 'character' ? isPendingCharImage(id) : type === 'scene' ? isPendingSceneImage(id) : isPendingPropImage(id)
}

/**
 * generate final prompt (dialog button and outer two-stage generation share the same key state, avoid duplicate triggers)
 * force=true ignore the existing prompt and force regeneration when
 * returns the final prompt; generation errors are thrown by the API, Agent returns when empty ''
 */
async function ensureAssetPrompt(type, id, force = false, autoImage = false) {
  const key = `${type}:${id}`
  if (generatingPromptKeys.value.includes(key)) return ''
  generatingPromptKeys.value.push(key)
  const hadImageProgress = !!assetProgressOf(type, id)
  if (!hadImageProgress) setAssetProgress(type, id, { stage: 'prompt', startedAt: Date.now(), elapsed: 0, error: '' })
  try {
    const res = type === 'character'
      ? await characterAPI.generatePrompt(id, epId.value, force, chatModelOverride(), chatConfigId(), autoImage)
      : type === 'scene'
        ? await sceneAPI.generatePrompt(id, epId.value, force, chatModelOverride(), chatConfigId(), autoImage)
        : await propAPI.generatePrompt(id, epId.value, force, chatModelOverride(), chatConfigId(), autoImage)
    const fp = res?.final_prompt || res?.finalPrompt || ''
    if (fp) applyFinalPrompt(type, id, fp)
    if (!hadImageProgress && !autoImage && !isAssetImagePending(type, id)) {
      setAssetProgress(type, id, { stage: 'done', elapsed: 0 })
      setTimeout(() => clearAssetProgress(type, id), 3000)
    }
    return fp
  } catch (e) {
    if (!hadImageProgress) setAssetProgress(type, id, { stage: 'failed', error: e?.message || String(e || '') })
    throw e
  } finally {
    generatingPromptKeys.value = generatingPromptKeys.value.filter(k => k !== key)
  }
}

/** generate the final prompt inside the dialog (without image generation); regenerate when a final prompt already exists (force) */
async function genAssetFinalPrompt() {
  const detail = assetDetail.value
  if (!detail.open || !detail.item?.id) return
  if (isAssetQueued(detail.type, detail.item.id) || isAssetJobActive(detail.type, detail.item.id)) {
    toast.info(t('episode.asset.alreadyQueued'))
    return
  }
  const force = !!assetFinalPrompt.value
  try {
    const fp = await ensureAssetPrompt(detail.type, detail.item.id, force, autoImageAfterPrompt.value)
    if (!fp) throw new Error(t('episode.asset.promptGenFailedRetry'))
    assetPromptDraft.value = fp
    assetPromptDirty.value = false
    toast.success(force ? t('episode.asset.promptRegenerated') : t('episode.asset.promptGenerated'))
    if (autoImageAfterPrompt.value) {
      toast.success(detail.type === 'character'
        ? t('episode.image.generatingChar')
        : detail.type === 'scene' ? t('episode.image.generatingScene') : t('episode.image.generatingProp'))
      await refresh()
      watchAsyncResult(() => {
        const item = detail.type === 'character'
          ? chars.value.find(c => c.id === detail.item.id)
          : detail.type === 'scene' ? scenes.value.find(s => s.id === detail.item.id) : propItems.value.find(p => p.id === detail.item.id)
        const done = !!(item?.image_url || item?.imageUrl)
        if (done) {
          const pending = detail.type === 'character' ? pendingCharImageIds : detail.type === 'scene' ? pendingSceneImageIds : pendingPropImageIds
          pending.value = pending.value.filter(x => x !== detail.item.id)
        }
        return done
      })
    }
  } catch (e) {
    toastError(e, { fallback: 'episode.asset.promptGenFailed' })
  }
}

async function copyAssetFinalPrompt() {
  const text = assetPromptDraft.value || assetFinalPrompt.value
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast.success(t('episode.asset.promptCopied'))
  } catch {
    toast.error(t('episode.asset.copyFailed'))
  }
}

async function saveAssetDetail() {
  const detail = assetDetail.value
  if (!detail.open || !detail.item?.id) return
  const item = detail.item
  // only submit fields that actually changed: a no-change save must not trigger backend prompt invalidation
  const payload = {}
  let infoChanged = false
  if (detail.type === 'character') {
    if (assetDetailDraft.value.appearance !== (item.appearance || '')) payload.appearance = assetDetailDraft.value.appearance
    if (assetDetailDraft.value.styling !== (item.styling || '')) payload.styling = assetDetailDraft.value.styling
  } else if (detail.type === 'scene') {
    if (assetDetailDraft.value.prompt !== (item.prompt || '')) payload.prompt = assetDetailDraft.value.prompt
    if (assetDetailDraft.value.lighting !== (item.lighting || '')) payload.lighting = assetDetailDraft.value.lighting
  } else {
    if (assetDetailDraft.value.description !== (item.description || '')) payload.description = assetDetailDraft.value.description
  }
  infoChanged = Object.keys(payload).length > 0
  // submit only when the final prompt was manually edited; empty string counts as clearing
  if (assetPromptDirty.value) payload.final_prompt = assetPromptDraft.value.trim() || ''
  if (!infoChanged && !assetPromptDirty.value) {
    toast.info(t('episode.asset.noChanges'))
    return
  }
  savingAssetDetail.value = true
  try {
    if (detail.type === 'character') await characterAPI.update(item.id, payload)
    else if (detail.type === 'scene') await sceneAPI.update(item.id, payload)
    else await propAPI.update(item.id, payload)
    // local sync: manually edited prompt uses the draft as source of truth; when only info fields change, the backend has already cleared the prompt
    const { final_prompt, ...infoPatch } = payload
    const promptValue = assetPromptDirty.value ? (payload.final_prompt || null) : (infoChanged ? null : (item.final_prompt || item.finalPrompt || null))
    Object.assign(item, infoPatch, { final_prompt: promptValue, finalPrompt: promptValue })
    const list = detail.type === 'character' ? chars.value : detail.type === 'scene' ? scenes.value : propItems.value
    const target = list.find(x => x.id === item.id)
    if (target) Object.assign(target, infoPatch, { final_prompt: promptValue, finalPrompt: promptValue })
    if (assetPromptDirty.value) assetPromptDraft.value = payload.final_prompt || ''
    assetPromptDirty.value = false
    toast.success(t('episode.asset.saved'))
  } catch (e) {
    toastError(e, { fallback: 'episode.asset.saveFailed' })
  } finally {
    savingAssetDetail.value = false
  }
}

function assetImageSrc(item) {
  const raw = item?.image_url || item?.imageUrl || ''
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw
  return `/${raw}`
}

function assetDetailTitle(detail) {
  if (!detail?.item) return ''
  if (detail.type === 'character') return detail.item.name || t('episode.asset.unnamedChar')
  if (detail.type === 'prop') return detail.item.name || t('episode.asset.unnamedProp')
  return detail.item.location || t('episode.asset.unnamedScene')
}

/** Asset detail dialog kicker / aria-label uses the long label */
function assetTypeLabel(type) {
  return { character: t('episode.asset.typeChar'), scene: t('episode.asset.typeScene'), prop: t('episode.asset.typeProp') }[type] || t('episode.asset.fallbackType')
}

/** asset detail preview image title (character portrait / scene image / prop image) */
function assetDetailImageTitle(detail) {
  if (!detail?.item) return ''
  const kindLabel = detail.type === 'character' ? t('episode.asset.charPortrait') : detail.type === 'scene' ? t('episode.asset.sceneImage') : t('common.prop')
  return `${assetDetailTitle(detail)} ${kindLabel}`
}

function characterAppearanceValue(char) {
  return char?.appearance || t('episode.asset.appearanceTodo')
}

function characterStylingValue(char) {
  return char?.styling || t('episode.asset.stylingTodo')
}

function characterVisualSummary(char) {
  return `${t('episode.asset.appearance')}${characterAppearanceValue(char)} · ${t('episode.asset.styling')}${characterStylingValue(char)}`
}

function sceneDescriptionValue(scene) {
  return scene?.prompt || scene?.description || t('episode.asset.sceneDescTodo')
}

function sceneLightingValue(scene) {
  return scene?.lighting || t('episode.asset.sceneLightTodo')
}

function handleImageViewerKeydown(event) {
  if (event.key !== 'Escape') return
  if (imageViewer.value.open) closeImageViewer()
  else if (assetDetail.value.open) closeAssetDetail()
  else if (taskDrawer.value) closeTaskDrawer()
}

onMounted(() => {
  window.addEventListener('keydown', handleImageViewerKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleImageViewerKeydown)
  stopGenTasksPolling()
  if (assetProgressTicker) { clearInterval(assetProgressTicker); assetProgressTicker = null }
})

function isPendingSceneImage(id) {
  return pendingSceneImageIds.value.includes(id)
}

function isPendingVideo(id) {
  return pendingVideoIds.value.includes(id)
}

function videoFailMessage(id) {
  return failedVideoMessages.value[id] || ''
}

// Content moderation failures (real person / sensitive content, e.g. Volcano Engine's OutputVideoSensitiveContentDetected):
// moderation thresholds differ across providers, guide the user to switch models and retry
function videoModerationHint(msg) {
  return MODERATION_RE.test(String(msg || '')) ? t('episode.vid.moderationHint') : ''
}

function videoTaskState(sb) {
  if (hasVid(sb)) return 'done'
  if (isPendingVideo(sb?.id)) return 'pending'
  if (videoFailMessage(sb?.id)) return 'failed'
  return 'ready'
}

function videoTaskStatusLabel(sb) {
  const state = videoTaskState(sb)
  if (state === 'done') return t('episode.status.done')
  if (state === 'pending') return t('episode.status.generating')
  if (state === 'failed') return t('episode.status.failed')
  return t('episode.status.todo')
}

function videoTaskActionLabel(sb) {
  const state = videoTaskState(sb)
  if (state === 'done') return t('episode.asset.regen')
  if (state === 'pending') return t('episode.asset.generating')
  return t('episode.asset.generate')
}

const allVideoTaskRows = computed(() => sbs.value.map((sb, index) => {
  const duration = Number(sb.duration || 5)
  const referenceCount = getShotReferenceImages(sb).length
  const sceneName = getSceneName(sb)
  return {
    id: sb.id,
    index,
    storyboard: sb,
    title: sb.description || t('episode.vid.shotN', { n: String(index + 1).padStart(2, '0') }),
    meta: sceneName,
    duration: Number.isFinite(duration) ? duration : 5,
    referenceCount,
    state: videoTaskState(sb),
    // show errors only while currently failed, avoid stale errors on shots that succeeded after retry
    error: videoTaskState(sb) === 'failed' ? videoFailMessage(sb.id) : '',
  }
}))
// list filtering: click a top stat badge to filter (click again to cancel)
const videoListFilter = ref('')
const videoTaskRows = computed(() => videoListFilter.value
  ? allVideoTaskRows.value.filter(task => task.state === videoListFilter.value)
  : allVideoTaskRows.value)
const videoTaskDoneCount = computed(() => allVideoTaskRows.value.filter(task => task.state === 'done').length)
const videoTaskFailedCount = computed(() => allVideoTaskRows.value.filter(task => task.state === 'failed').length)
function toggleVideoFilter(state) {
  videoListFilter.value = videoListFilter.value === state ? '' : state
}

// ===== batch video: selection mode + pre-generation confirmation (video generation is costly, avoid accidentally triggering all) =====
const videoSelectMode = ref(false)
const selectedVideoSbIds = ref([])
const batchVideoConfirm = ref({ open: false, targets: [] })

function isVideoSbSelected(id) { return selectedVideoSbIds.value.includes(id) }
function toggleVideoSbSelect(id) {
  selectedVideoSbIds.value = isVideoSbSelected(id)
    ? selectedVideoSbIds.value.filter(item => item !== id)
    : [...selectedVideoSbIds.value, id]
}
function toggleVideoSelectMode() {
  videoSelectMode.value = !videoSelectMode.value
  if (!videoSelectMode.value) selectedVideoSbIds.value = []
}
function onVideoTaskRowClick(sb) {
  if (videoSelectMode.value) toggleVideoSbSelect(sb.id)
  else selectedSb.value = sb
}

// narrator character detection: keyword match by content language (narrator characters from extraction are excluded from image generation)
function isNarratorCharacter(char) {
  const text = `${char?.name || ''} ${char?.role || ''}`.toLowerCase()
  return ['narrator', 'voiceover', 'voice-over', 'offscreen', 'ナレーター', 'ナレーション', '내레이션', '해설'].some(k => text.includes(k))
}

const visualChars = computed(() => chars.value.filter(c => !isNarratorCharacter(c)))
const lockedVideoConfigId = computed(() => episode.value?.video_config_id || episode.value?.videoConfigId || null)
// Episode video resolution: edited directly in the top bar (persisted to episodes.resolution; generation tasks are locked to this value).
// internally stores uniformly 480p/720p/1080p three tiers, UI shows provider-native tiers for the selected video model
// (Seedance 480p/720p, MiniMax 768P/2K, Wan 3.0 480P/720P/1080P), the adapter maps them to official enums
const RESOLUTION_TIERS = {
  volcengine: ['480p', '720p'],
  minimax: ['720p', '1080p'],
  aliyun: ['480p', '720p', '1080p'],
  gemini: ['720p', '1080p'],
}
const RESOLUTION_DISPLAY = {
  volcengine: { '480p': '480p', '720p': '720p', '1080p': '720p' },
  minimax: { '480p': '768P', '720p': '768P', '1080p': '2K' },
  aliyun: { '480p': '480P', '720p': '720P', '1080p': '1080P' },
  gemini: { '480p': '720p', '720p': '720p', '1080p': '1080p' },
}
const resolutionProvider = computed(() => RESOLUTION_TIERS[selectedVideoConfig.value?.provider] ? selectedVideoConfig.value.provider : 'volcengine')
const resolutionOptions = computed(() => RESOLUTION_TIERS[resolutionProvider.value].map(key => ({
  key,
  model: `${RESOLUTION_DISPLAY[resolutionProvider.value][key]} · ${t(`episode.resolution.${key === '480p' ? 'smooth' : key === '720p' ? 'hd' : 'uhd'}`)}`,
})))
const episodeResolution = computed({
  get: () => {
    const v = episode.value?.resolution
    return resolutionOptions.value.some(o => o.key === v) ? v : '720p'
  },
  set: (val) => { void changeEpisodeResolution(val) },
})
async function changeEpisodeResolution(val) {
  if (!episode.value || val === episodeResolution.value) return
  const prev = episode.value.resolution
  episode.value.resolution = val
  const label = resolutionOptions.value.find(o => o.key === val)?.model || val
  try {
    await episodeAPI.update(epId.value, { resolution: val })
    toast.success(t('episode.vid.resolutionSwitched', { label }))
  } catch (e) {
    episode.value.resolution = prev
    toastError(e)
  }
}
// aspect ratio fixed at project creation, video generation uses it uniformly
const dramaAspectRatio = computed(() => drama.value?.aspect_ratio || drama.value?.aspectRatio || '16:9')

// list of selectable generation models: model array in the config (first is the config default); API API may return an array or JSON string
function configModels(cfg) {
  const raw = cfg?.model
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(Boolean)
  try { const m = JSON.parse(raw); return Array.isArray(m) ? m.filter(Boolean) : [m].filter(Boolean) } catch { return [raw].filter(Boolean) }
}
// Aggregate models from all active configs of this type (deduped by provider + model, sorted by priority); call with the owning config when a model is selected
// selected value uses 'provider/model' composite key: same-named models may come from different providers (e.g. gateway and official), must be distinguished
function collectModelOptions(cfgs) {
  const seen = new Set()
  const out = []
  const sorted = [...cfgs].filter(c => c.is_active).sort((a, b) => (b.priority || 0) - (a.priority || 0))
  for (const c of sorted) {
    for (const m of configModels(c)) {
      const key = `${c.provider}/${m}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ key, model: m, provider: c.provider, configId: c.id, configName: c.name || c.provider })
    }
  }
  return out
}
// composite key → bare model name (backend adapter validates model names by provider, must not include a provider prefix)
function bareModelName(key) {
  if (!key) return ''
  const i = key.indexOf('/')
  return i >= 0 ? key.slice(i + 1) : key
}
function ownerConfigId(options, key) {
  return key ? (options.find(o => o.key === key)?.configId || undefined) : undefined
}
function hasMultiConfigs(options) {
  return new Set(options.map(o => o.configId)).size > 1
}
const textModelOptions = computed(() => collectModelOptions(textConfigs.value))
const imageModelOptions = computed(() => collectModelOptions(imageConfigs.value))
const videoModelOptions = computed(() => collectModelOptions(videoConfigs.value))
const selectedVideoConfig = computed(() => {
  const selected = videoModelOptions.value.find(option => option.key === videoModel.value)
  if (selected) return videoConfigs.value.find(config => config.id === selected.configId)
  const locked = videoConfigs.value.find(config => config.id === lockedVideoConfigId.value && config.is_active)
  if (locked) return locked
  return [...videoConfigs.value]
    .filter(config => config.is_active)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))[0]
})
const isWan3Video = computed(() => selectedVideoConfig.value?.provider === 'aliyun'
  || bareModelName(videoModel.value).startsWith('wan3.0-video'))
const isGeminiVideo = computed(() => selectedVideoConfig.value?.provider === 'gemini'
  || bareModelName(videoModel.value).startsWith('veo-'))

// Reference image limit (Wan 3.0 official: 10 images, other models: 9); bound asset collection and @name mapping read the same value
const refImageLimit = computed(() => isWan3Video.value ? 10 : 9)

// Effective config for this generation (model/resolution/duration), used by the right summary and batch confirmation dialog
const effectiveVideoModelLabel = computed(() => {
  const explicit = bareModelName(videoModel.value)
  if (explicit) return explicit
  return configModels(selectedVideoConfig.value)[0] || ''
})
const episodeResolutionLabel = computed(() =>
  resolutionOptions.value.find(o => o.key === episodeResolution.value)?.model || episodeResolution.value)
// short tier label (480p / 768P / 2K and other provider-native tiers), used in the bottom effective-config summary
const episodeResolutionShort = computed(() =>
  RESOLUTION_DISPLAY[resolutionProvider.value][episodeResolution.value] || episodeResolution.value)
const effectiveVideoDuration = computed(() => Number(selectedSb.value?.duration || 10))
const batchVideoTotalDuration = computed(() =>
  batchVideoConfirm.value.targets.reduce((sum, sb) => sum + (Number(sb.duration) || 5), 0))

function openBatchVideoConfirm(pool) {
  const targets = pool.filter(s => !isPendingVideo(s.id))
  if (!targets.length) { toast.info(t('episode.vid.noneToGenerate')); return }
  batchVideoConfirm.value = { open: true, targets }
}
function batchVideos() {
  // selection mode with checked items → only selected (allow regenerating completed shots); otherwise all unfinished (pending + failed)
  const useSelection = videoSelectMode.value && selectedVideoSbIds.value.length
  const pool = useSelection
    ? sbs.value.filter(s => selectedVideoSbIds.value.includes(s.id))
    : sbs.value.filter(s => !hasVid(s))
  openBatchVideoConfirm(pool)
}
function retryFailedVideos() {
  openBatchVideoConfirm(sbs.value.filter(s => videoTaskState(s) === 'failed'))
}
function confirmBatchVideos() {
  const targets = [...batchVideoConfirm.value.targets]
  batchVideoConfirm.value = { open: false, targets: [] }
  if (!targets.length) return
  const ids = targets.map(s => s.id).filter(id => {
    const target = sbs.value.find(s => s.id === id)
    return target && !hasVid(target)
  })
  if (!ids.length) { toast.info(t('episode.vid.noneToGenerate')); return }
  const added = enqueueVideoJobs(ids, true)
  if (added.length) toast.success(t('episode.vid.batchQueued', { n: added.length }))
  else toast.info(t('episode.vid.alreadyQueued'))
  if (videoSelectMode.value) toggleVideoSelectMode()
}

// after config changes, verify the persisted model still exists (fall back to default if config deleted or model removed, avoid sending an invalid model to the backend)
function pruneStaleModel(modelRef, optionsRef) {
  watch(optionsRef, opts => {
    if (!modelRef.value || !opts.length) return
    if (opts.some(o => o.key === modelRef.value)) return
    // legacy local storage had only bare model names: if matched, upgrade to a composite key, otherwise fall back to default
    const legacy = opts.filter(o => o.model === modelRef.value)
    modelRef.value = legacy.length ? legacy[0].key : ''
  }, { immediate: true })
}
pruneStaleModel(chatModel, textModelOptions)
pruneStaleModel(imageModel, imageModelOptions)
pruneStaleModel(videoModel, videoModelOptions)
const textModelMultiCfg = computed(() => hasMultiConfigs(textModelOptions.value))
const imageModelMultiCfg = computed(() => hasMultiConfigs(imageModelOptions.value))
const videoModelMultiCfg = computed(() => hasMultiConfigs(videoModelOptions.value))

// Production step helpers
// ========== task list panel ==========
async function loadGenTasks() {
  if (!epId.value) return
  try {
    const data = await taskAPI.listByEpisode(epId.value)
    genTasks.value = data?.tasks || []
    genMerges.value = data?.merges || []

    // pending/failed states exist only in memory, lost after page refresh;restore from sys_task records per storyboard,
    // Otherwise failed shots degrade to "pending" after refresh
    const videoTasks = genTasks.value.filter(t => t.type === 'video' && t.storyboard_id)
    // take only the latest task per storyboard(created_at descending, id fallback), old tasks do not affect current state
    const latestBySb = new Map()
    for (const t of videoTasks) {
      const prev = latestBySb.get(t.storyboard_id)
      if (!prev
        || String(t.created_at || '') > String(prev.created_at || '')
        || (String(t.created_at || '') === String(prev.created_at || '') && t.id > prev.id)) {
        latestBySb.set(t.storyboard_id, t)
      }
    }
    // pending/failed is rebuilt in full instead of unioned with existing values — otherwise a restored "in progress" never disappears after a task fails
    // never disappear(videoTaskState in pending takes priority over failed, the retry button stays disabled)
    const pending = new Set()
    const failed = {}
    for (const [sbId, t] of latestBySb) {
      // storyboard already has a video(succeeded after retry following failure)no longer report stale errors when
      if (hasVid(sbs.value.find(s => s.id === sbId))) continue
      if (t.status === 'processing') pending.add(sbId)
      else if (t.status === 'failed') failed[sbId] = t.error_msg || t('episode.status.failed')
    }
    // just clicked submit, preserve local state before task records load, avoid state flicker
    for (const id of pendingVideoIds.value) if (!latestBySb.has(id)) pending.add(id)
    for (const id of Object.keys(failedVideoMessages.value)) {
      if (!latestBySb.has(Number(id))) failed[id] = failedVideoMessages.value[id]
    }
    pendingVideoIds.value = [...pending]
    failedVideoMessages.value = failed
  } catch { /* silent failure, do not interrupt other refreshes */ }
}

function stopGenTasksPolling() {
  if (genTasksTimer) { clearInterval(genTasksTimer); genTasksTimer = null }
}

const genTaskActiveCount = computed(() =>
  genTasks.value.filter(t => t.status === 'processing').length +
  genMerges.value.filter(m => m.status === 'processing' || m.status === 'pending').length
)
const genTaskDoneCount = computed(() =>
  genTasks.value.filter(t => t.status === 'completed').length +
  genMerges.value.filter(m => m.status === 'completed').length
)
const genTaskFailedCount = computed(() =>
  genTasks.value.filter(t => t.status === 'failed').length +
  genMerges.value.filter(m => m.status === 'failed').length
)

function genTaskTargetLabel(task) {
  if (task.storyboard_id) {
    const sb = sbs.value.find(x => x.id === task.storyboard_id)
    return t('episode.tasks.sbN', { n: sb?.storyboard_number ?? sb?.storyboardNumber ?? task.storyboard_id })
  }
  if (task.character_id) {
    const c = chars.value.find(x => x.id === task.character_id)
    return `${t('common.role')} · ${c?.name || task.character_id}`
  }
  if (task.scene_id) {
    const s = scenes.value.find(x => x.id === task.scene_id)
    return `${t('common.scene')} · ${s?.location || task.scene_id}`
  }
  if (task.prop_id) {
    const p = propItems.value.find(x => x.id === task.prop_id)
    return `${t('common.prop')} · ${p?.name || task.prop_id}`
  }
  return t('episode.tasks.generic')
}

// unified row structure: image / video / merge three merge types sorted newest first
const genTaskRows = computed(() => {
  const taskRows = genTasks.value.map(t => ({
    key: `task-${t.id}`,
    kind: t.type, // image | video
    id: t.id,
    targetLabel: genTaskTargetLabel(t),
    provider: t.provider || '',
    model: t.model || '',
    status: t.status || 'processing',
    errorMsg: t.error_msg || '',
    previewUrl: t.local_path || t.result_url || '',
    prompt: t.prompt || '',
    createdAt: t.created_at || '',
    completedAt: t.completed_at || '',
  }))
  const mergeRows = genMerges.value.map(m => ({
    key: `merge-${m.id}`,
    kind: 'merge',
    id: m.id,
    targetLabel: t('episode.tasks.fullMerge'),
    provider: m.provider || 'ffmpeg',
    model: m.model || '',
    status: m.status || 'pending',
    errorMsg: m.error_msg || '',
    previewUrl: m.merged_url || '',
    prompt: '',
    createdAt: m.created_at || '',
    completedAt: m.completed_at || '',
  }))
  return [...taskRows, ...mergeRows].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
})

function genTaskKindLabel(kind) {
  return kind === 'image' ? t('common.serviceType.image') : kind === 'video' ? t('common.serviceType.video') : t('episode.tasks.mergeKind')
}

function genTaskStatusLabel(status) {
  if (status === 'completed') return t('episode.status.done')
  if (status === 'failed') return t('episode.status.failed')
  return t('episode.status.generating')
}

// map to existing video-task-status style classes:is-done / is-pending / is-failed
function genTaskStateClass(status) {
  if (status === 'completed') return 'done'
  if (status === 'failed') return 'failed'
  return 'pending'
}

// local_path append for site-relative paths '/', remote result_url used as-is
function genTaskPreviewSrc(url) {
  if (!url) return ''
  return /^https?:\/\//.test(url) ? url : '/' + url
}

function genTaskDuration(row) {
  if (!row.createdAt || !row.completedAt) return ''
  const ms = new Date(row.completedAt).getTime() - new Date(row.createdAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  return ms >= 60000 ? `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s` : `${Math.round(ms / 1000)}s`
}

// when the drawer is open with active tasks,4s polling;stop when closed or all finished
watch([taskDrawer, genTaskActiveCount], ([open, active]) => {
  stopGenTasksPolling()
  if (open && active > 0) {
    genTasksTimer = setInterval(loadGenTasks, 4000)
  }
})

const productionBlockMessage = computed(() => {
  if (!scriptContent.value) return t('episode.prod.scriptFirst')
  return ''
})
const productionBlockActionLabel = computed(() => {
  if (!scriptContent.value) return t('episode.export.gotoScript')
  return t('episode.prod.goBack')
})
function goProductionBlockTarget() {
  if (!scriptContent.value) {
    panel.value = 'script'
    scriptStep.value = rawContent.value ? 1 : 0
    return
  }
  panel.value = 'production'
  prodTab.value = 'assets'
}
const stepLabels = computed(() => [t('episode.script.raw'), t('episode.script.rewrite')])

const charImgCount = computed(() => visualChars.value.filter(c => c.image_url || c.imageUrl).length)
const sceneImgCount = computed(() => scenes.value.filter(s => s.image_url || s.imageUrl).length)
const propImgCount = computed(() => propItems.value.filter(p => p.image_url || p.imageUrl).length)
const shotVidCount = computed(() => sbs.value.filter(s => s.video_url || s.videoUrl).length)
const visualCharTotal = computed(() => visualChars.value.length)
const pendingCharacterImageCount = computed(() => Math.max(visualCharTotal.value - charImgCount.value, 0))
const pendingSceneImageCount = computed(() => Math.max(scenes.value.length - sceneImgCount.value, 0))
const pendingAssetImageCount = computed(() => pendingCharacterImageCount.value + pendingSceneImageCount.value)
const assetTotalCount = computed(() => visualCharTotal.value + scenes.value.length + propItems.value.length)
const assetReadyCount = computed(() => charImgCount.value + sceneImgCount.value + propImgCount.value)

const prodTabDefs = computed(() => [
  { id: 'assets', label: t('episode.prod.assets'), icon: FolderKanban, badge: assetTotalCount.value ? `${assetReadyCount.value}/${assetTotalCount.value}` : '' },
  { id: 'videos', label: t('episode.prod.videos'), icon: Clapperboard, badge: sbs.value.length ? `${shotVidCount.value}/${sbs.value.length}` : '' },
])

const mainStageDefs = computed(() => ([
  { id: 'script', label: t('episode.stage.script'), desc: t('episode.stage.scriptDesc'), icon: FileText },
  { id: 'assets', label: t('episode.prod.assets'), desc: t('episode.stage.assetsDesc'), icon: FolderKanban },
  { id: 'videos', label: t('episode.stage.videos'), desc: t('episode.stage.videosDesc'), icon: Clapperboard },
  { id: 'export', label: t('episode.stage.export'), desc: t('episode.stage.exportDesc'), icon: Download },
]))

const sidebarSections = computed(() => ([
  {
    id: 'script',
    label: t('episode.stage.script'),
    items: [
      { key: 'script:raw', label: t('episode.script.raw'), desc: '', icon: FileText },
      { key: 'script:rewrite', label: t('episode.script.rewrite'), desc: '', icon: FileText },
    ],
  },
  {
    id: 'production',
    label: t('episode.stage.production'),
    items: [
      { key: 'prod:assets', label: t('episode.prod.assets'), desc: '', icon: Users },
      { key: 'prod:videos', label: t('episode.prod.videos'), desc: '', icon: Clapperboard },
    ],
  },
  {
    id: 'export',
    label: t('episode.stage.export'),
    items: [
      { key: 'export:merge', label: t('episode.stage.mergeExport'), desc: '', icon: Download },
    ],
  },
]))

// major stage state:pending(not started)/ active(In progress)/ done(done)/ none(no status shown, for export)
// in progress = stage has some progress but is not fully done, or is the current stage
function sectionState(sectionId) {
  if (sectionId === 'export') return 'none'
  const done = sectionId === 'script'
    ? mainStageDone('script')
    : mainStageDone('assets') && mainStageDone('videos')
  if (done) return 'done'

  const hasProgress = sectionId === 'script'
    ? !!(rawContent.value || scriptContent.value)
    : !!(chars.value.length || scenes.value.length || propItems.value.length || sbs.value.length || shotVidCount.value)
  const isCurrent = sectionId === 'script'
    ? panel.value === 'script'
    : panel.value === 'production'
  return (hasProgress || isCurrent) ? 'active' : 'pending'
}

const activeMainStage = computed(() => {
  if (panel.value === 'export') return 'export'
  if (panel.value === 'production') {
    return prodTab.value === 'assets' ? 'assets' : 'videos'
  }
  return 'script'
})

function mainStageDone(stageId) {
  if (stageId === 'script') return !!scriptContent.value
  if (stageId === 'assets') return assetTotalCount.value > 0 && assetReadyCount.value === assetTotalCount.value
  if (stageId === 'videos') {
    return !!sbs.value.length && shotVidCount.value === sbs.value.length
  }
  if (stageId === 'export') return exportDone.value
  return false
}

function goMainStage(stageId) {
  if (stageId === 'script') {
    panel.value = 'script'
    scriptStep.value = Math.min(scriptStep.value, 1)
    return
  }
  if (stageId === 'assets') {
    panel.value = 'production'
    prodTab.value = 'assets'
    return
  }
  if (stageId === 'videos') {
    panel.value = 'production'
    prodTab.value = 'videos'
    return
  }
  panel.value = 'export'
}

const activeSubStepKey = computed(() => {
  if (panel.value === 'script') {
    if (scriptStep.value === 0) return 'script:raw'
    return 'script:rewrite'
  }
  if (panel.value === 'production') return `prod:${prodTab.value}`
  return 'export:merge'
})

// Step marquee: four main stages (script → asset production → video production → export); click a segment to jump, flowing glow on the current stage
const mainProgressSteps = computed(() => [
  { id: 'script', label: t('episode.stage.script') },
  { id: 'assets', label: t('episode.prod.assets') },
  { id: 'videos', label: t('episode.stage.videos') },
  { id: 'export', label: t('episode.stage.export') },
])
const currentMainIdx = computed(() => {
  const i = mainProgressSteps.value.findIndex(s => s.id === activeMainStage.value)
  return i < 0 ? 0 : i
})

function goSubStep(key) {
  if (key.startsWith('script:')) {
    panel.value = 'script'
    const stepMap = {
      'script:raw': 0,
      'script:rewrite': 1,
    }
    scriptStep.value = stepMap[key] ?? 0
    return
  }
  if (key.startsWith('prod:')) {
    panel.value = 'production'
    prodTab.value = key.replace('prod:', '')
    return
  }
  panel.value = 'export'
}

const pipelineTotal = 2
const pipelineProgress = computed(() =>
  ['script', 'production'].filter(id => sectionState(id) === 'done').length
)

const currentStageLabel = computed(() => {
  if (panel.value === 'script') return t('episode.stage.scriptStage', { step: stepLabels.value[scriptStep.value] })
  if (panel.value === 'production') return t('episode.stage.prodStage', { step: prodTabDefs.value[prodTabIdx.value]?.label || t('episode.stage.production') })
  return exportDone.value ? t('episode.stage.exportDone') : t('episode.stage.exportWaiting')
})

const currentMainStageLabel = computed(() => {
  const current = mainStageDefs.value.find(stage => stage.id === activeMainStage.value)
  return current?.label || t('episode.stage.workbench')
})

const currentSubStageLabel = computed(() => currentStageLabel.value)

const totalDuration = computed(() => sbs.value.reduce((s, sb) => s + (sb.duration || 10), 0))
const selectedSb = ref(null)
const selectedVideoTaskNumber = computed(() => {
  const index = videoTaskRows.value.findIndex(task => String(task.id) === String(selectedSb.value?.id))
  return index >= 0 ? index + 1 : 0
})

function updateField(sb, field, value) {
  const current = sb[field] ?? sb[toCamel(field)]
  if (current === value) return
  sb[field] = value
  const camelField = toCamel(field)
  if (camelField !== field) sb[camelField] = value
  storyboardAPI.update(sb.id, { [field]: value }).catch(e => toastError(e))
}

function toCamel(field) {
  return field.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function getStoryboardCharacterIds(sb) {
  return sb?.character_ids || sb?.characterIds || []
}

function getStoryboardCharacters(sb) {
  const ids = getStoryboardCharacterIds(sb)
  return visualChars.value.filter(char => ids.includes(char.id))
}

function getStoryboardScene(sb) {
  const sceneId = sb?.scene_id || sb?.sceneId
  if (!sceneId) return null
  return scenes.value.find(s => s.id === sceneId) || null
}

function isStoryboardCharacterSelected(sb, charId) {
  return getStoryboardCharacterIds(sb).includes(charId)
}

function toggleStoryboardCharacter(sb, charId) {
  const currentIds = getStoryboardCharacterIds(sb)
  const nextIds = currentIds.includes(charId)
    ? currentIds.filter(id => id !== charId)
    : [...currentIds, charId]
  updateField(sb, 'character_ids', nextIds)
}

function getStoryboardPropIds(sb) {
  return sb?.prop_ids || sb?.propIds || []
}

function getStoryboardProps(sb) {
  const ids = getStoryboardPropIds(sb)
  return propItems.value.filter(p => ids.includes(p.id))
}

function isStoryboardPropSelected(sb, propId) {
  return getStoryboardPropIds(sb).includes(propId)
}

function toggleStoryboardProp(sb, propId) {
  const currentIds = getStoryboardPropIds(sb)
  const nextIds = currentIds.includes(propId)
    ? currentIds.filter(id => id !== propId)
    : [...currentIds, propId]
  updateField(sb, 'prop_ids', nextIds)
}

function getSceneName(sb) {
  const scene = getStoryboardScene(sb)
  if (!scene) return ''
  return `${scene.location} · ${scene.time || t('episode.asset.noTime')}`
}

const sceneOptions = computed(() => [
  { label: t('episode.sb.unboundScene'), value: '' },
  ...scenes.value.map(s => ({ label: `${s.location} · ${s.time || t('episode.asset.noTime')}`, value: s.id })),
])


function sceneShotCount(sceneId) {
  return sbs.value.filter(sb => String(sb?.scene_id || sb?.sceneId || '') === String(sceneId)).length
}

watch(rawContent, v => { localRaw.value = v }, { immediate: true })
watch(scriptContent, v => { localScript.value = v }, { immediate: true })

async function refresh() {
  try {
    drama.value = await dramaAPI.get(dramaId)
    const ep = drama.value.episodes?.find(e => (e.episode_number || e.episodeNumber) === episodeNumber)
    if (ep) {
      episode.value = ep
      try { chars.value = await episodeAPI.characters(ep.id) } catch { chars.value = [] }
      try { scenes.value = await episodeAPI.scenes(ep.id) } catch { scenes.value = [] }
      try { propItems.value = await episodeAPI.props(ep.id) } catch { propItems.value = [] }
      sbs.value = await episodeAPI.storyboards(ep.id)
      selectedVideoSbIds.value = selectedVideoSbIds.value.filter(id => sbs.value.some(sb => sb.id === id))
      if (sbs.value.length) {
        const currentSelectedId = selectedSb.value?.id
        selectedSb.value = sbs.value.find(sb => sb.id === currentSelectedId) || sbs.value[0]
      } else {
        selectedSb.value = null
      }

      const epHasContent = !!(episode.value?.content)
      const epHasScript = !!(episode.value?.script_content || episode.value?.scriptContent)

      if (panelRestored) {
        // restored to the last step, skip auto reset (only applies on first load)
        panelRestored = false
      } else if (epHasScript || epHasContent) scriptStep.value = 1
      else scriptStep.value = 0
    }
  } catch (e) {
    toastError(e)
  }
  try { mergeData.value = await mergeAPI.status(epId.value) } catch {}
  await Promise.all([loadGenTasks(), loadExportMerges()])
}

function saveRaw() { episodeAPI.update(epId.value, { content: localRaw.value }); episode.value.content = localRaw.value }
function saveScr() { episodeAPI.update(epId.value, { script_content: localScript.value }); episode.value.script_content = localScript.value }
// the message sent to the Agent is a functional prompt, not UI copy: output language is controlled by the backend global "content language" directive,
// this functional text stays fixed regardless of UI language
function doRewrite() { saveRaw(); runAgent('script_rewriter', 'Baca skrip episode ini, tulis ulang menjadi skrip berformat, lalu simpan', dramaId, epId.value, refresh, chatModelOverride(), chatConfigId()) }
function skipRewrite() {
  const raw = (localRaw.value || rawContent.value || '').trim()
  if (!raw) {
    toast.warning(t('episode.script.rawRequired'))
    return
  }
  localScript.value = raw
  saveScr()
  toast.success(t('episode.script.skipDone'))
  panel.value = 'production'
  prodTab.value = 'assets'
}
// asset extraction: independent async task per type (driven by the backend task table), all three can run in parallel; frontend polls status until done
// label evaluated at render time (language switch takes effect instantly), key is a logical value
const EXTRACT_TARGETS = computed(() => [
  { key: 'characters', label: t('common.role') },
  { key: 'scenes', label: t('common.scene') },
  { key: 'props', label: t('common.prop') },
])
const extractingTargets = ref([])
const extractingLabels = computed(() => EXTRACT_TARGETS.value.filter(x => extractingTargets.value.includes(x.key)).map(x => x.label).join(t('common.listJoin')))
function isExtracting(target) { return extractingTargets.value.includes(target) }

function doExtract(target) {
  if (isExtracting(target) || !epId.value) return
  saveScr()
  extractingTargets.value.push(target)
  episodeAPI.extract(epId.value, target, chatModelOverride(), chatConfigId())
    .then(() => pollExtractStatus(target))
    .catch(e => {
      extractingTargets.value = extractingTargets.value.filter(x => x !== target)
      toastError(e)
    })
}
function doExtractAll() { EXTRACT_TARGETS.value.forEach(x => doExtract(x.key)) }

function pollExtractStatus(target, attempts = 150) {
  const label = EXTRACT_TARGETS.value.find(x => x.key === target)?.label || target
  const tick = async (left) => {
    try {
      const st = await episodeAPI.extractStatus(epId.value)
      const task = st?.[target]
      if (task && task.status !== 'running') {
        extractingTargets.value = extractingTargets.value.filter(x => x !== target)
        if (task.status === 'done') {
          toast.success(t('episode.extract.done', { type: label }))
          await refresh()
        } else {
          toastError(task.error, { fallback: 'episode.extract.failed' })
        }
        return
      }
    } catch {}
    if (left > 0) setTimeout(() => tick(left - 1), 2500)
    else extractingTargets.value = extractingTargets.value.filter(x => x !== target)
  }
  setTimeout(() => tick(attempts), 2500)
}

/** restore running extraction task state after page load (refresh does not lose progress display) */
async function syncExtractStatus() {
  if (!epId.value) return
  try {
    const st = await episodeAPI.extractStatus(epId.value)
    for (const x of EXTRACT_TARGETS.value) {
      if (st?.[x.key]?.status === 'running' && !isExtracting(x.key)) {
        extractingTargets.value.push(x.key)
        pollExtractStatus(x.key)
      }
    }
  } catch {}
  try {
    const vp = await episodeAPI.videoPromptsStatus(epId.value)
    if (vp?.status === 'running' && !videoPromptBatch.value.running) {
      videoPromptBatch.value = { running: true, total: vp.total || 0, completed: vp.completed || 0 }
      pollVideoPromptBatch()
    }
  } catch {}
}

// ─── batch video prompts: backend generates per storyboard asynchronously, frontend polls progress ──────────
const videoPromptBatch = ref({ running: false, total: 0, completed: 0 })
// single video prompt generation: tracked by storyboard ID, allow parallel generation across storyboards (bypass the global rn lock)
const videoPromptGeneratingIds = ref([])
// video page multi-select shortcuts: select all / only videos not yet generated (selected set shared with batch video selectedVideoSbIds)
function toggleSelectAllVideos() {
  selectedVideoSbIds.value = selectedVideoSbIds.value.length === sbs.value.length ? [] : sbs.value.map(sb => sb.id)
}
function selectMissingVideos() {
  selectedVideoSbIds.value = sbs.value.filter(sb => !hasVid(sb)).map(sb => sb.id)
}

async function batchVideoPrompts() {
  if (videoPromptBatch.value.running || !epId.value) return
  if (!sbs.value.length) { toast.warning(t('episode.sb.breakFirst')); return }
  // in selection mode with checked items → only fill selected; otherwise fill all missing
  const ids = (videoSelectMode.value && selectedVideoSbIds.value.length) ? [...selectedVideoSbIds.value] : undefined
  try {
    const res = await episodeAPI.generateVideoPrompts(epId.value, chatModelOverride(), chatConfigId(), ids)
    if (!res?.total) {
      if (res?.already_running) {
        videoPromptBatch.value = { running: true, total: 0, completed: 0 }
        pollVideoPromptBatch()
      } else toast.info(ids ? t('episode.sb.selectedMissing') : t('episode.sb.allHavePrompts'))
      return
    }
    videoPromptBatch.value = { running: true, total: res.total, completed: 0 }
    toast.info(t('episode.sb.batchStarted', { n: res.total }))
    pollVideoPromptBatch()
  } catch (e) {
    toastError(e)
  }
}

function pollVideoPromptBatch(attempts = 240) {
  const tick = async (left) => {
    try {
      const st = await episodeAPI.videoPromptsStatus(epId.value)
      if (st && st.status !== 'running') {
        videoPromptBatch.value = { running: false, total: 0, completed: 0 }
        await refresh()
        if (st.status === 'done') {
          toast.success(st.failed ? t('episode.sb.batchDoneFailed', { n: st.failed }) : t('episode.sb.batchDone'))
        } else {
          toastError(st.error, { fallback: 'episode.sb.batchFailed' })
        }
        return
      }
      if (st) {
        const prev = videoPromptBatch.value.completed
        videoPromptBatch.value = { running: true, total: st.total || 0, completed: st.completed || 0 }
        if ((st.completed || 0) !== prev) await refresh() // refresh on each completion, prompts appear progressively
      }
    } catch {}
    if (left > 0) setTimeout(() => tick(left - 1), 2500)
    else videoPromptBatch.value = { running: false, total: 0, completed: 0 }
  }
  setTimeout(() => tick(attempts), 2500)
}
function doBreakdown() {
  const charList = chars.value.length
    ? chars.value.map(c => `${c.name}(ID:${c.id})`).join(', ')
    : '(Episode ini belum memiliki karakter)'
  const sceneList = scenes.value.length
    ? scenes.value.map(s => `${s.location} · ${s.time || 'Waktu belum diatur'}(ID:${s.id})`).join(', ')
    : '(Episode ini belum memiliki adegan)'
  const propList = propItems.value.length
    ? propItems.value.map(p => `${p.name}(ID:${p.id})`).join(', ')
    : '(Episode ini belum memiliki properti)'
  runAgent('storyboard_breaker', `Urai skrip episode ini menjadi storyboard, dan untuk setiap segmen storyboard sekaligus buat video_prompt (prompt pembuatan video).
Model video kali ini: ${effectiveVideoModelLabel.value}, buat video_prompt sesuai karakteristik dan batasan durasi model tersebut.

Karakter yang sudah ada di episode ini: ${charList}
Adegan yang sudah ada di episode ini: ${sceneList}
Properti yang sudah ada di episode ini: ${propList}

Persyaratan binding:
- Setiap shot harus memilih karakter yang muncul dari daftar karakter yang sudah ada di episode ini di atas berdasarkan isi skrip, lalu mengikat character_ids (ID harus berasal dari daftar di atas; jika ada karakter yang muncul pasti diikat, jangan ada yang terlewat)
- Setiap shot sebaiknya mencocokkan adegan yang sudah ada di atas untuk mengisi scene_id (ID harus berasal dari daftar di atas), jangan menciptakan adegan baru dari imajinasi
- Jika ada properti kunci yang muncul di shot (digunakan, diserahkan, close-up, atau terlihat jelas di frame), ikat prop_ids dari daftar properti yang sudah ada di episode ini di atas (ID harus berasal dari daftar di atas); jika tidak ada properti yang muncul, kirim array kosong
- Hanya shot lingkungan kosong murni yang boleh tidak mengikat karakter`, dramaId, epId.value, onBreakdownDone, chatModelOverride(), chatConfigId())
}

/** after split, refresh and auto-fill missing video prompts (guard against Agent omission/truncation) */
async function onBreakdownDone() {
  await refresh()
  const missing = sbs.value.filter(sb => !(sb.video_prompt || sb.videoPrompt || '').trim())
  if (missing.length) batchVideoPrompts()
}

// generate a video prompt for a single storyboard on demand: generated by prompt_generator from storyboard fields and saved to video_prompt
async function genVideoPrompt(sb) {
  if (!sb || videoPromptGeneratingIds.value.includes(sb.id)) return
  const idx = sbs.value.indexOf(sb) + 1
  const cfg = selectedVideoConfig.value
  const label = cfg ? `${cfg.name} (${cfg.provider})` : 'Default'
  const charNames = getStoryboardCharacters(sb).map(c => c.name).join(', ') || 'none'
  const propNames = getStoryboardProps(sb).map(p => p.name).join(', ') || 'none'
  videoPromptGeneratingIds.value.push(sb.id)
  try {
    await api.post(`/agent/prompt_generator/chat`, {
      message: `Buat video_prompt (prompt pembuatan video) untuk storyboard #${idx}(ID:${sb.id}). Model video:${label}, buat sesuai karakteristik dan batasan durasi model tersebut.

Informasi storyboard ini: durasi ${sb.duration || 10}s;adegan:${getSceneName(sb) || 'belum terikat'};karakter:${charNames};properti:${propNames}.

Panggil read_storyboard_context terlebih dahulu untuk mendapatkan deskripsi visual storyboard ini (berisi sub-shot 【ShotN】 dan dialog/narasi), suasana, dan durasi, lalu buat video_prompt (dibagi menjadi baris per segmen 3 detik, rujuk materi referensi dengan @namaKarakter/@namaAdegan/@namaProperti; diperbolehkan beberapa shot berganti dalam satu segmen, tetapi tidak boleh melintasi adegan, titik potong sejajar dengan struktur 【ShotN】 pada description), lalu panggil update_storyboard untuk menyimpan ke storyboard ID:${sb.id}. Hanya perbarui field video_prompt, jangan ubah field lain, jangan urai ulang seluruh episode.`,
      drama_id: dramaId,
      episode_id: epId.value,
      model: chatModelOverride() || undefined,
      config_id: chatConfigId() || undefined,
    })
    toast.success(t('episode.sb.promptGenerated', { n: idx }))
    await refresh()
  } catch (e) {
    toastError(e)
  } finally {
    videoPromptGeneratingIds.value = videoPromptGeneratingIds.value.filter(id => id !== sb.id)
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function watchAsyncResult(check, attempts = 24, delay = 2500) {
  void (async () => {
    for (let i = 0; i < attempts; i++) {
      await sleep(delay)
      await refresh()
      if (check()) return
    }
  })()
}

async function watchAssetImages(taskIds, ids, kind, attempts = 48, delay = 2500) {
  const clearPending = () => {
    const pendingRef = kind === 'character' ? pendingCharImageIds : kind === 'scene' ? pendingSceneImageIds : pendingPropImageIds
    pendingRef.value = pendingRef.value.filter(item => !ids.includes(item))
  }
  const startedAt = Date.now()
  for (const id of ids) setAssetProgress(kind, id, { stage: 'generating', startedAt, elapsed: 0, error: '' })
  const findRec = id => kind === 'character'
    ? chars.value.find(c => c.id === id)
    : kind === 'scene'
      ? scenes.value.find(s => s.id === id)
      : propItems.value.find(p => p.id === id)
  for (let i = 0; i < attempts; i++) {
    await sleep(delay)
    const elapsed = Math.round((Date.now() - startedAt) / 1000)
    for (const id of ids) setAssetProgress(kind, id, { stage: 'generating', elapsed })
    await refresh()
    const done = ids.every(id => {
      const rec = findRec(id)
      return !!(rec?.image_url || rec?.imageUrl)
    })
    if (done) {
      for (const id of ids) setAssetProgress(kind, id, { stage: 'done', elapsed })
      setTimeout(() => { for (const id of ids) clearAssetProgress(kind, id) }, 4000)
      clearPending(); return true
    }
    let failedMsg = ''
    for (const tid of taskIds) {
      try {
        const task = await taskAPI.get(tid)
        const st = task?.status
        if (st === 'failed' || st === 'error' || st === 'timeout') { failedMsg = task?.errorMsg || ''; break }
      } catch {}
    }
    if (failedMsg) {
      for (const id of ids) setAssetProgress(kind, id, { stage: 'failed', error: failedMsg, elapsed })
      clearPending()
      toast.error(failedMsg)
      return false
    }
  }
  for (const id of ids) setAssetProgress(kind, id, { stage: 'failed', error: t('episode.image.genTimeout'), elapsed: Math.round((Date.now() - startedAt) / 1000) })
  clearPending()
  toast.info(t('episode.image.genTimeout'))
  return false
}

/** Tombol generate satuan: masuk antrean FIFO (diproses satu per satu) */
function genCharImg(id) {
  const added = enqueueAssetJobs('character', [id])
  if (!added.length) { toast.info(t('episode.asset.alreadyQueued')); return }
  if (added[0].pos > 1) toast.info(t('episode.asset.singleQueued', { pos: added[0].pos }))
  else toast.success(t('episode.image.generatingChar'))
}
function batchCharImages() {
  const ids = visualChars.value.filter(c => !(c.image_url || c.imageUrl)).map(c => c.id)
  if (!ids.length) { toast.info(t('episode.image.allCharsDone')); return }
  const added = enqueueAssetJobs('character', ids)
  if (added.length) toast.success(t('episode.asset.batchQueued', { n: added.length }))
  else toast.info(t('episode.asset.alreadyQueued'))
}
function genSceneImg(id) {
  const added = enqueueAssetJobs('scene', [id])
  if (!added.length) { toast.info(t('episode.asset.alreadyQueued')); return }
  if (added[0].pos > 1) toast.info(t('episode.asset.singleQueued', { pos: added[0].pos }))
  else toast.success(t('episode.image.generatingScene'))
}
function isPendingPropImage(id) {
  return pendingPropImageIds.value.includes(id)
}
function genPropImg(id) {
  const added = enqueueAssetJobs('prop', [id])
  if (!added.length) { toast.info(t('episode.asset.alreadyQueued')); return }
  if (added[0].pos > 1) toast.info(t('episode.asset.singleQueued', { pos: added[0].pos }))
  else toast.success(t('episode.image.generatingProp'))
}
function batchSceneImages() {
  const ids = scenes.value.filter(s => !(s.image_url || s.imageUrl)).map(s => s.id)
  if (!ids.length) { toast.info(t('episode.image.allScenesDone')); return }
  const added = enqueueAssetJobs('scene', ids)
  if (added.length) toast.success(t('episode.asset.batchQueued', { n: added.length }))
  else toast.info(t('episode.asset.alreadyQueued'))
}
function batchPropImages() {
  const ids = propItems.value.filter(p => !(p.image_url || p.imageUrl)).map(p => p.id)
  if (!ids.length) { toast.info(t('episode.image.allPropsDone')); return }
  const added = enqueueAssetJobs('prop', ids)
  if (added.length) toast.success(t('episode.asset.batchQueued', { n: added.length }))
  else toast.info(t('episode.asset.alreadyQueued'))
}
function getVideoUrl(s) { return s?.video_url || s?.videoUrl || s?.composed_video_url || s?.composedVideoUrl || null }
function hasVid(s) { return !!getVideoUrl(s) }

// ===== storyboard video history (one storyboard may have multiple videos, sys_task all records retained)=====
const sbVideoHistory = ref([])
const previewVideoUrl = ref('') // history video currently previewed(relative path);empty = preview the current main video

// Note: /tasks returns raw rows (camelCase), /episodes/:id/generation-tasks returns snake_case; both naming styles are supported
function taskVideoPath(t) { return t?.local_path || t?.localPath || t?.result_url || t?.resultUrl || '' }
function taskCreatedAt(t) { return t?.created_at || t?.createdAt || '' }
function isCurrentVideo(t) { const p = taskVideoPath(t); return !!p && p === getVideoUrl(selectedSb.value) }

async function loadSbVideoHistory() {
  previewVideoUrl.value = ''
  if (!selectedSb.value?.id) { sbVideoHistory.value = []; return }
  try {
    const rows = await taskAPI.list({ type: 'video', storyboard_id: selectedSb.value.id })
    sbVideoHistory.value = (Array.isArray(rows) ? rows : [])
      .filter(t => t.status === 'completed' && taskVideoPath(t))
      .sort((a, b) => taskCreatedAt(b).localeCompare(taskCreatedAt(a)))
  } catch { sbVideoHistory.value = [] }
}

watch(() => [selectedSb.value?.id, getVideoUrl(selectedSb.value)], () => { loadSbVideoHistory() })

function previewHistoryVideo(t) {
  previewVideoUrl.value = isCurrentVideo(t) ? '' : taskVideoPath(t)
}

async function setAsMainVideo() {
  const sb = selectedSb.value
  if (!sb || !previewVideoUrl.value) return
  try {
    await storyboardAPI.update(sb.id, { video_url: previewVideoUrl.value })
    sb.video_url = previewVideoUrl.value
    sb.videoUrl = previewVideoUrl.value
    toast.success(t('episode.vid.setMainDone'))
  } catch (e) { toastError(e, { fallback: 'episode.vid.setMainFailed' }) }
}

async function removeHistoryVideo(t) {
  try {
    await taskAPI.del(t.id)
    sbVideoHistory.value = sbVideoHistory.value.filter(x => x.id !== t.id)
    if (previewVideoUrl.value === taskVideoPath(t)) previewVideoUrl.value = ''
    toast.success(t('episode.vid.historyDeleted'))
  } catch (e) { toastError(e, { fallback: 'common.deleteFailed' }) }
}

function formatHistoryTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function getShotReferenceImages(sb) {
  const refs = []
  const pushRef = (value) => {
    if (!value || refs.includes(value) || refs.length >= refImageLimit.value) return
    refs.push(value)
  }
  const scene = getStoryboardScene(sb)
  pushRef(scene?.image_url || scene?.imageUrl)
  for (const char of getStoryboardCharacters(sb)) {
    pushRef(char?.image_url || char?.imageUrl)
  }
  for (const prop of getStoryboardProps(sb)) {
    pushRef(prop?.image_url || prop?.imageUrl)
  }
  return refs
}

// right reference asset panel: all bindable assets of this episode (single-select scene, multi-select characters/props), bound flag indicates whether bound
// kind is an English code (logical value); typeLabel is a display name (evaluated at render time)
function shotBindableAssets(sb) {
  const out = []
  for (const char of visualChars.value) {
    const imageUrl = char.image_url || char.imageUrl || ''
    out.push({
      key: `character-${char.id}`,
      id: char.id,
      kind: 'character',
      typeLabel: t('common.role'),
      name: char.name || t('episode.asset.unnamedChar'),
      meta: char.role || t('episode.asset.charPortrait'),
      imageUrl,
      ready: !!imageUrl,
      bound: getStoryboardCharacterIds(sb).includes(char.id),
    })
  }
  for (const scene of scenes.value) {
    const imageUrl = scene.image_url || scene.imageUrl || ''
    out.push({
      key: `scene-${scene.id}`,
      id: scene.id,
      kind: 'scene',
      typeLabel: t('common.scene'),
      name: `${scene.location} · ${scene.time || t('episode.asset.noTime')}`,
      meta: scene.time || t('episode.asset.sceneImage'),
      imageUrl,
      ready: !!imageUrl,
      bound: (sb?.scene_id || sb?.sceneId) === scene.id,
    })
  }
  for (const prop of propItems.value) {
    const imageUrl = prop.image_url || prop.imageUrl || ''
    out.push({
      key: `prop-${prop.id}`,
      id: prop.id,
      kind: 'prop',
      typeLabel: t('common.prop'),
      name: prop.name || t('episode.asset.unnamedProp'),
      meta: prop.type || t('episode.asset.propSingleImage'),
      imageUrl,
      ready: !!imageUrl,
      bound: getStoryboardPropIds(sb).includes(prop.id),
    })
  }
  // Fixed order (character → scene → prop, in original asset order): bind/unbind does not reorder, avoids jumping
  return out
}

// right reference asset panel for rendering: all assets bindable to the current storyboard
const refBindableAssets = computed(() => {
  const sb = selectedSb.value
  return sb ? shotBindableAssets(sb) : []
})

// Right column "Bound reference images": assets bound to the current storyboard (submitted as reference images at generation), laid out in group order
const boundRefAssets = computed(() => refBindableAssets.value.filter(a => a.bound))

// reference panel group order (kind code driven, label evaluated at render time)
const REF_KINDS = computed(() => ([
  { kind: 'character', label: t('common.role') },
  { kind: 'scene', label: t('common.scene') },
  { kind: 'prop', label: t('common.prop') },
]))

// right panel toggle binding: single-select scene (switch/unbind), multi-select characters/props (kind code check, does not rely on display copy)
function toggleShotBind(sb, asset) {
  if (asset.kind === 'scene') {
    const current = sb?.scene_id || sb?.sceneId
    updateField(sb, 'scene_id', current === asset.id ? null : asset.id)
    return
  }
  if (asset.kind === 'character') {
    toggleStoryboardCharacter(sb, asset.id)
    return
  }
  toggleStoryboardProp(sb, asset.id)
}

// Video prompt @ mention candidates: only characters and props bound to the current storyboard (by name) and scenes (by location); display order: character → scene → prop
// kind is a logical value (MentionTextarea colors/picks the icon by kind), group is display copy
const mentionOptions = computed(() => {
  const sb = selectedSb.value
  if (!sb) return []
  const scene = getStoryboardScene(sb)
  return [
    ...getStoryboardCharacters(sb).map(c => ({
      label: c.name,
      value: c.name,
      kind: 'character',
      group: t('common.role'),
      image: thumbOf(assetImageSrc(c)),
    })),
    ...(scene ? [{
      label: `${scene.location} · ${scene.time || t('episode.asset.noTime')}`,
      value: scene.location,
      kind: 'scene',
      group: t('common.scene'),
      image: thumbOf(assetImageSrc(scene)),
    }] : []),
    ...getStoryboardProps(sb).map(p => ({
      label: p.name,
      value: p.name,
      kind: 'prop',
      group: t('common.prop'),
      image: thumbOf(assetImageSrc(p)),
    })),
  ]
})

// Build an index mapping for @name mentions in reference image order (scene image first, character images in the middle, prop images last), for video prompt mention replacement
function getShotReferenceIndexMap(sb) {
  const ordered = []
  const seen = new Set()
  const push = (name, url) => {
    if (!url || seen.has(url) || ordered.length >= refImageLimit.value) return
    seen.add(url)
    ordered.push({ name, imageUrl: url })
  }
  const scene = getStoryboardScene(sb)
  push(scene?.location || '', scene?.image_url || scene?.imageUrl)
  for (const char of getStoryboardCharacters(sb)) {
    push(char.name || '', char?.image_url || char?.imageUrl)
  }
  for (const prop of getStoryboardProps(sb)) {
    push(prop.name || '', prop?.image_url || prop?.imageUrl)
  }
  const nameToIndex = {}
  ordered.forEach((a, i) => { if (a.name && !(a.name in nameToIndex)) nameToIndex[a.name] = i + 1 })
  return nameToIndex
}

// Replace @name mentions in video prompts with @imageN-name tokens (N is the 1-based reference image index), used at generation time
function resolveVideoPromptRefs(sb) {
  const prompt = sb.video_prompt || sb.videoPrompt || ''
  const map = getShotReferenceIndexMap(sb)
  const names = Object.keys(map).sort((a, b) => b.length - a.length)
  if (!names.length) return prompt
  return prompt.replace(/@([^\s@]+)/g, (m, raw) => {
    for (const name of names) {
      if (raw.startsWith(name)) {
        return `@Gambar${map[name]}${name}${raw.slice(name.length)}`
      }
    }
    return m
  })
}

// shot duration (edit in the generation params and save to the storyboard):
// clamp to the current video model limits then write to storyboards.duration, list/batch/single generation all read this value
function onVideoDurationChange(e) {
  const sb = selectedSb.value
  if (!sb) return
  const min = isWan3Video.value ? 2 : 4
  const max = isWan3Video.value ? 30 : isGeminiVideo.value ? 8 : 15
  let v = Math.round(Number(e.target.value))
  if (!Number.isFinite(v)) v = Number(sb.duration || 10)
  v = Math.min(max, Math.max(min, v))
  e.target.value = v
  updateField(sb, 'duration', v)
}

function pickFile(accept, cb) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept
  input.onchange = () => { const f = input.files?.[0]; if (f) cb(f) }
  input.click()
}

// ===== Manual upload of asset images (character portrait / scene image / prop image) =====
// upload type label evaluated at render time
const assetUploadLabelMap = computed(() => ({
  character: t('episode.asset.charPortrait'),
  scene: t('episode.asset.sceneImage'),
  prop: t('episode.asset.propImage'),
}))
const uploadingAssetKeys = ref([])
function isUploadingAsset(kind, id) { return uploadingAssetKeys.value.includes(`${kind}:${id}`) }
function uploadAssetImage(kind, id) {
  pickFile('image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', async (file) => {
    const key = `${kind}:${id}`
    if (!uploadingAssetKeys.value.includes(key)) uploadingAssetKeys.value.push(key)
    try {
      const res = await uploadAPI.image(file)
      // consistent with image generation write-back: store a relative path (static/...), frontend adds a leading slash when displaying
      const payload = { image_url: res.path, local_path: res.path }
      if (kind === 'character') await characterAPI.update(id, payload)
      else if (kind === 'scene') await sceneAPI.update(id, payload)
      else await propAPI.update(id, payload)
      toast.success(t('episode.upload.assetDone', { type: assetUploadLabelMap.value[kind] || '' }))
      await refresh()
    } catch (e) {
      toastError(e)
    } finally {
      uploadingAssetKeys.value = uploadingAssetKeys.value.filter(k => k !== key)
    }
  })
}

// ─── Antrean video: SATU PER SATU (FIFO) ─────────────────────────────────
// Batch maupun tombol satuan masuk antrean ini; worker memproses satu shot
// sampai selesai/gagal sebelum lanjut — tidak ada lagi N request video
// serentak. Setiap item antre punya indikator (posisi antre / elapsed).
const videoQueue = ref([]) // [{ id, silent }] menunggu giliran
const videoQueueActive = ref(null) // storyboard id sedang diproses
const videoProgressMap = ref({}) // sbId -> { stage, queuePos, queueTotal, startedAt, elapsed, error }
function setVideoProgress(id, patch) {
  const prev = videoProgressMap.value[id] || { stage: 'queued', startedAt: Date.now(), elapsed: 0, error: '' }
  videoProgressMap.value = { ...videoProgressMap.value, [id]: { ...prev, ...patch } }
}
function clearVideoProgress(id) {
  if (!(id in videoProgressMap.value)) return
  const next = { ...videoProgressMap.value }
  delete next[id]
  videoProgressMap.value = next
}
function videoProgressOf(id) { return videoProgressMap.value[id] || null }
function videoProgressPercent(id) {
  const p = videoProgressOf(id)
  if (!p) return 0
  if (p.stage === 'done') return 100
  if (p.stage === 'failed') return 100
  if (p.stage === 'generating') {
    // Estimasi: video biasanya 1–10 menit; naik mulus 5→95% lalu mentok.
    const elapsed = Math.max(p.elapsed || 0, p.startedAt ? (Date.now() - p.startedAt) / 1000 : 0)
    return Math.min(95, Math.round(5 + Math.min(elapsed / 600, 1) * 90))
  }
  return 8
}
function videoProgressLabel(id) {
  const p = videoProgressOf(id)
  if (!p) return ''
  if (p.stage === 'queued') {
    return (p.queuePos && p.queueTotal)
      ? t('episode.vid.queuePos', { pos: p.queuePos, total: p.queueTotal })
      : t('episode.asset.stageQueued')
  }
  if (p.stage === 'generating') return t('episode.vid.videoGenerating', { n: Math.round(Math.max(p.elapsed || 0, 0)) })
  if (p.stage === 'done') return t('episode.asset.stageDone')
  if (p.stage === 'failed') return p.error || t('episode.asset.stageFailed')
  return ''
}
function refreshVideoQueueProgress() {
  const activeCount = videoQueueActive.value ? 1 : 0
  const total = videoQueue.value.length + activeCount
  videoQueue.value.forEach((j, i) => {
    setVideoProgress(j.id, { stage: 'queued', queuePos: i + 1 + activeCount, queueTotal: total, elapsed: 0, error: '' })
  })
}
function enqueueVideoJobs(ids, silent = false) {
  const added = []
  for (const id of ids) {
    if (videoQueueActive.value === id || videoQueue.value.some(j => j.id === id)) continue
    videoQueue.value.push({ id, silent })
    if (!pendingVideoIds.value.includes(id)) pendingVideoIds.value.push(id)
    added.push(id)
  }
  refreshVideoQueueProgress()
  const result = added.map(id => {
    const idx = videoQueue.value.findIndex(j => j.id === id)
    return { id, pos: idx + 1 + (videoQueueActive.value ? 1 : 0) }
  })
  pumpVideoQueue()
  return result
}
let videoQueuePumping = false
async function pumpVideoQueue() {
  if (videoQueuePumping) return
  videoQueuePumping = true
  try {
    while (videoQueue.value.length) {
      const job = videoQueue.value.shift()
      videoQueueActive.value = job.id
      refreshVideoQueueProgress()
      try {
        await runVideoJob(job.id, job.silent)
      } catch (e) { /* runVideoJob sudah mencatat failed + toast */ }
      videoQueueActive.value = null
      refreshVideoQueueProgress()
    }
  } finally {
    videoQueuePumping = false
  }
}
/** Satu job video: kirim request → tunggu selesai. Awaitable. */
async function runVideoJob(sbId, silent = false) {
  const startedAt = Date.now()
  try {
    const sb = sbs.value.find(s => s.id === sbId)
    if (!sb) {
      pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== sbId)
      clearVideoProgress(sbId)
      return false
    }
    if (hasVid(sb)) {
      pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== sbId)
      clearVideoProgress(sbId)
      return true
    }
    const referenceImages = getShotReferenceImages(sb)
    const params = {
      storyboard_id: sb.id,
      drama_id: dramaId,
      prompt: resolveVideoPromptRefs(sb),
      duration: Number(sb.duration || 10),
      aspect_ratio: dramaAspectRatio.value,
      generate_audio: true,
      model: bareModelName(videoModel.value) || undefined,
      config_id: ownerConfigId(videoModelOptions.value, videoModel.value),
      reference_image_urls: referenceImages,
    }
    if (!params.prompt && !referenceImages.length) {
      throw new Error(t('episode.vid.needRefOrPrompt'))
    }
    delete failedVideoMessages.value[sbId]
    setVideoProgress(sbId, { stage: 'generating', startedAt, elapsed: 0, error: '' })
    const generation = await taskAPI.generate({ type: 'video', ...params })
    await refresh()
    return await pollVideoGeneration(generation?.id, sbId, silent)
  } catch (e) {
    pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== sbId)
    setVideoProgress(sbId, { stage: 'failed', error: e?.message || String(e || ''), elapsed: Math.round((Date.now() - startedAt) / 1000) })
    failedVideoMessages.value = { ...failedVideoMessages.value, [sbId]: e.message || t('episode.vid.genFailed') }
    toastError(e, { fallback: 'episode.vid.genFailed' })
    return false
  }
}
/** Batalkan video yang masih menunggu (yang sedang berjalan diselesaikan) */
function cancelVideoQueue() {
  const waiting = [...videoQueue.value]
  if (!waiting.length) return
  videoQueue.value = []
  const ids = waiting.map(j => j.id)
  pendingVideoIds.value = pendingVideoIds.value.filter(id => !ids.includes(id))
  for (const id of ids) clearVideoProgress(id)
  toast.info(t('episode.vid.queueCancelled', { n: waiting.length }))
}
const videoQueueStatusText = computed(() => {
  const parts = []
  if (videoQueueActive.value) {
    const idx = sbs.value.findIndex(s => s.id === videoQueueActive.value)
    const sb = sbs.value[idx]
    parts.push(t('episode.vid.queueActive', { name: sb?.description || `#${idx >= 0 ? idx + 1 : videoQueueActive.value}` }))
  }
  if (videoQueue.value.length) parts.push(t('episode.vid.queueWaiting', { n: videoQueue.value.length }))
  return parts.join(' · ')
})
async function genVid(sb, opts = {}) {
  const referenceImages = getShotReferenceImages(sb)
  const prompt = resolveVideoPromptRefs(sb)
  if (!prompt && !referenceImages.length) {
    toast.error(t('episode.vid.needRefOrPrompt'))
    return
  }
  const added = enqueueVideoJobs([sb.id], !!opts.silent)
  if (!added.length) { toast.info(t('episode.vid.alreadyQueued')); return }
  if (!opts.silent) {
    if (added[0].pos > 1) toast.info(t('episode.vid.singleQueued', { pos: added[0].pos }))
    else toast.success(t('episode.vid.generating'))
  }
}
async function pollVideoGeneration(generationId, storyboardId, silent = false) {
  const startedAt = Date.now()
  const elapsed = () => Math.round((Date.now() - startedAt) / 1000)
  if (!generationId) {
    watchAsyncResult(() => {
      const target = sbs.value.find(s => s.id === storyboardId)
      const done = !!(target?.video_url || target?.videoUrl)
      if (done) {
        pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
        setVideoProgress(storyboardId, { stage: 'done', elapsed: elapsed() })
        setTimeout(() => clearVideoProgress(storyboardId), 4000)
      }
      return done
    }, 60, 4000)
    return true
  }
  for (let i = 0; i < 120; i++) {
    await sleep(4000)
    setVideoProgress(storyboardId, { stage: 'generating', elapsed: elapsed() })
    try {
      const res = await taskAPI.get(generationId)
      await refresh()
      if (res?.status === 'completed') {
        pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
        delete failedVideoMessages.value[storyboardId]
        setVideoProgress(storyboardId, { stage: 'done', elapsed: elapsed() })
        setTimeout(() => clearVideoProgress(storyboardId), 4000)
        if (!silent) toast.success(t('episode.vid.genDone'))
        return true
      }
      if (res?.status === 'failed') {
        pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
        const errMsg = res?.error_msg || res?.errorMsg || t('episode.vid.genFailed')
        failedVideoMessages.value = {
          ...failedVideoMessages.value,
          [storyboardId]: errMsg,
        }
        setVideoProgress(storyboardId, { stage: 'failed', error: errMsg, elapsed: elapsed() })
        if (!silent) toastError(errMsg, { fallback: 'episode.vid.genFailed' })
        return false
      }
    } catch {}
  }
  pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
  failedVideoMessages.value = {
    ...failedVideoMessages.value,
    [storyboardId]: t('episode.vid.genTimeout'),
  }
  setVideoProgress(storyboardId, { stage: 'failed', error: t('episode.vid.genTimeout'), elapsed: elapsed() })
  if (!silent) toast.error(t('episode.vid.genTimeout'))
  return false
}
async function doMerge(ids) {
  const storyboardIds = Array.isArray(ids) ? ids : undefined
  if (storyboardIds && !storyboardIds.length) {
    toast.error(t('episode.export.selectFirst'))
    return
  }
  try {
    await mergeAPI.merge(epId.value, storyboardIds, { subtitles: burnSubtitles.value })
    toast.success(t('episode.export.mergingToast'))
  } catch (e) {
    toastError(e, { fallback: 'episode.export.mergeFailed' })
    return
  }
  const poll = setInterval(async () => {
    try { mergeData.value = await mergeAPI.status(epId.value) } catch {}
    if (mergeData.value?.status === 'completed' || mergeData.value?.status === 'failed') {
      clearInterval(poll)
      if (mergeData.value.status === 'completed') {
        toast.success(t('episode.export.mergeDone'))
        loadExportMerges()
      } else {
        toastError(mergeData.value?.error_msg || mergeData.value?.errorMsg, { fallback: 'episode.export.mergeFailed' })
      }
    }
  }, 3000)
}
async function loadConfigs() {
  try {
    const [imgCfgs, vidCfgs, txtCfgs] = await Promise.all([
      aiConfigAPI.list('image'),
      aiConfigAPI.list('video'),
      aiConfigAPI.list('text'),
    ])
    imageConfigs.value = imgCfgs || []
    videoConfigs.value = vidCfgs || []
    textConfigs.value = txtCfgs || []
  } catch (e) { console.error('Failed to load AI configs', e) }
}

onMounted(async () => { await refresh(); loadConfigs(); syncExtractStatus() })
</script>

<style scoped>
/* ===== Studio Layout ===== */
.studio {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  padding: 8px;
  gap: 8px;
  background: var(--surface-base);
  /* selected state:neutral inversion(near-black in light / near-white in dark), vs in-progress(blue pulse)/done(green check)distinguish,
      follows the "colors only indicate status" rule — selected is not a status, so it stays colorless */
  --sel: var(--text-0);
  --sel-bg: var(--bg-active);
  --sel-text: var(--text-0);
  --sel-glow: var(--bg-hover);
}

.studio-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
  min-height: 40px;
  padding: 4px 10px;
  border-radius: var(--radius-lg);
  background: var(--header-bg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-card);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
}

.studio-topbar-main,
.sidebar,
.main {
  background: var(--surface-raised);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-card);
}

.studio-topbar-main {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  box-shadow: none;
  backdrop-filter: none;
  background: transparent;
  min-width: 0;
}

/* use higher specificity to override the later .back-btn{height:40px}, keep the top bar compact */
.studio-topbar .topbar-back {
  width: auto;
  min-width: 72px;
  padding: 0 12px;
  height: 26px;
  border-radius: var(--radius-pill);
  white-space: nowrap;
  font-size: 11px;
  flex-shrink: 1;
}

.studio-identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.studio-overline {
  display: none;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-3);
}

.studio-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.studio-title {
  font-size: 13px;
  line-height: 1;
  letter-spacing: -0.04em;
  white-space: nowrap;
}

.studio-episode-chip {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 8px;
  border-radius: var(--radius-pill);
  background: var(--accent-bg);
  color: var(--accent-text);
  font-size: 9px;
  font-weight: 700;
}

.studio-meta-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
  min-width: 0;
}

.studio-meta-pill {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 8px;
  border-radius: var(--radius-pill);
  background: var(--accent-bg);
  color: var(--accent-text);
  font-size: 8px;
  font-weight: 600;
  white-space: nowrap;
}

.studio-meta-pill.is-stage {
  background: var(--accent-bg);
  color: var(--accent-text);
}
.studio-meta-pill.is-progress {
  background: var(--success-bg);
  color: var(--success);
}
.studio-meta-inline {
  font-size: 9px;
  color: var(--text-3);
  font-weight: 600;
  white-space: nowrap;
}

.studio-topbar-side {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.studio-actions {
  display: flex;
  gap: 6px;
}
.studio-topbar .btn {
  height: 26px;
  padding: 0 9px;
  font-size: 10.5px;
  white-space: nowrap;
}

.studio-body {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);  /* column width follows the actual sidebar width (46px when collapsed) */
  gap: 8px;
  min-height: 0;
  flex: 1;
}

/* ===== Sidebar ===== */
.sidebar {
  width: 208px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  border-radius: var(--radius);
}
.back-btn {
  min-width: 40px; width: auto; height: 40px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  gap: 6px;
  padding: 0 12px;
  border: none; border-radius: var(--radius-pill);
  background: var(--overlay-track); color: var(--text-1);
  cursor: pointer; transition: all 0.18s var(--ease-out);
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
}
.back-btn:hover {
  background: var(--bg-active);
  color: var(--text-0);
}
.back-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3.5px var(--button-focus);
}

/* Pipeline Nav */
.pipeline { flex: 1; overflow-y: auto; padding: 12px 10px 8px; display: flex; flex-direction: column; gap: 8px; }
.pipe-section { display: flex; flex-direction: column; gap: 2px; }
.pipe-section-label {
  display: flex; align-items: center; gap: 5px;
  font-size: 10.5px; font-weight: 700; color: var(--text-3);
  text-transform: uppercase; letter-spacing: 0.06em;
  padding: 0 7px 2px;
}
/* group headings stay neutral gray, status color only on the small left indicator */
.pipe-section-state {
  width: 13px; height: 13px; border-radius: 999px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
}
.pipe-section.is-done .pipe-section-state {
  background: var(--success-bg); color: var(--success);
  border: 1px solid var(--success-bg);
}
.pipe-section-dot {
  width: 5px; height: 5px; border-radius: 999px;
  background: var(--text-3); opacity: 0.55;
}
.pipe-section-pulse {
  width: 6px; height: 6px; border-radius: 999px;
  background: var(--accent);
  animation: pipeSectionPulse 1.6s var(--ease-out) infinite;
}
@keyframes pipeSectionPulse {
  0% { box-shadow: 0 0 0 0 var(--accent-glow); }
  70% { box-shadow: 0 0 0 5px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}
.pipe-section-tag {
  font-size: 9.5px; font-weight: 600; letter-spacing: 0.03em;
  color: var(--text-2); background: var(--bg-2);
  border-radius: 999px; padding: 1px 5px;
  text-transform: none;
}
/* sub-step in progress: pulse dot synced with the major stage */
.pipe-item.doing { color: var(--text-1); }
.pipe-item.doing .pipe-icon {
  background: var(--accent-bg);
  border-color: var(--accent-glow);
}
.pipe-item-pulse {
  width: 6px; height: 6px; border-radius: 999px;
  background: var(--accent);
  animation: pipeSectionPulse 1.6s var(--ease-out) infinite;
}
.pipe-item {
  position: relative;
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px;
  padding: 7px 10px;
  border-radius: var(--radius);
  font-size: 13px; font-weight: 600;
  background: transparent; border: 1px solid transparent; color: var(--text-2); cursor: pointer;
  transition: all 0.18s var(--ease-out); width: 100%; text-align: left;
}
.pipe-item:hover {
  background: var(--bg-hover);
  border-color: transparent;
  color: var(--text-0);
}
.pipe-item.active {
  background: var(--sel-bg);
  color: var(--sel-text);
  border-color: transparent;
  box-shadow: none;
}
/* ChatFire signature: active stage left 3px brand-color rounded indicator bar */
.pipe-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 9px;
  bottom: 9px;
  width: 3px;
  border-radius: 999px;
  background: var(--accent);
}
.pipe-item:focus-visible {
  outline: none;
  border-color: var(--action-primary);
  box-shadow: 0 0 0 3px var(--button-focus), var(--button-shadow);
}
.pipe-item.done { color: var(--text-2); }
.pipe-item-sub {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  padding: 5px 8px;
  position: relative;
  min-height: 34px;
}

.pipe-item-sub:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 15px;
  top: 23px;
  bottom: -6px;
  width: 1px;
  background: var(--border);
}

.pipe-icon {
  width: 16px; height: 16px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-2); border: 1px solid var(--border);
  color: var(--text-3); flex-shrink: 0; transition: all 0.15s;
  position: relative;
  z-index: 1;
}
.pipe-item.active .pipe-icon { background: var(--sel); border-color: var(--sel); color: var(--surface-raised); }
.pipe-item.done .pipe-icon { background: var(--success-bg); border-color: var(--success-bg); color: var(--success); }
.pipe-item.active.done .pipe-icon { background: var(--sel); border-color: var(--sel); color: var(--surface-raised); }
.icon-active { background: var(--sel) !important; border-color: var(--sel) !important; color: var(--surface-raised) !important; }
.icon-done { background: var(--success-bg) !important; border-color: var(--success-bg) !important; color: var(--success) !important; }
.pipe-item.active.done .icon-done { background: var(--sel) !important; border-color: var(--sel) !important; color: var(--surface-raised) !important; }

.pipe-label { flex: 1; font-size: 12.5px; }
.pipe-copy { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.pipe-sub {
  display: none;
  font-size: 10px;
  line-height: 1.35;
  color: var(--text-3);
  font-weight: 500;
}
.pipe-badge {
  font-size: 9px; font-weight: 700; padding: 1px 5px;
  border-radius: 99px; background: var(--bg-3); color: var(--text-3);
  font-family: var(--font-mono);
}
.pipe-badge.badge-done { background: var(--success-bg); color: var(--success); }
.pipe-spinner { width: 10px; height: 10px; border: 1.5px solid var(--accent-bg); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }

/* Sidebar Bottom */
.sidebar-bottom {
  padding: 9px 10px 10px;
  border-top: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 7px;
  flex-shrink: 0;
  background: var(--surface-soft);
}
/* collapse/expand button */
.sidebar-toggle {
  display: flex; align-items: center; justify-content: center; gap: 5px;
  width: 100%; min-height: 22px;
  border: none; border-radius: 6px;
  background: transparent; color: var(--text-3);
  font: 600 11px var(--font-body);
  cursor: pointer; transition: background 0.14s, color 0.14s;
}
.sidebar-toggle:hover { background: var(--bg-hover); color: var(--text-0); }
.sidebar-toggle-icon { transition: transform 0.22s var(--ease-out); flex-shrink: 0; }
.sidebar.collapsed .sidebar-toggle-icon { transform: rotate(180deg); }

/* ===== collapsed state: narrow icon rail ===== */
.sidebar { transition: width 0.22s var(--ease-out); }
.sidebar.collapsed { width: 46px; }
.sidebar.collapsed .pipeline { padding: 12px 5px 8px; gap: 10px; }
.sidebar.collapsed .pipe-section-label { justify-content: center; padding: 0 0 2px; }
.sidebar.collapsed .pipe-section-label > span:not(.pipe-section-state) { display: none; }
.sidebar.collapsed .pipe-item {
  grid-template-columns: auto; justify-content: center;
  padding: 6px 0; min-height: 0;
}
.sidebar.collapsed .pipe-item .pipe-copy { display: none; }
.sidebar.collapsed .pipe-item-sub:not(:last-child)::after { display: none; }
.sidebar.collapsed .pipe-icon { width: 22px; height: 22px; }
/* Collapsed state: pulse dot on an in-progress step */
.pipe-mini-pulse {
  position: absolute; top: -3px; right: -3px;
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--accent);
  border: 1.5px solid var(--surface-raised);
  animation: pipeSectionPulse 1.6s var(--ease-out) infinite;
}
.sidebar.collapsed .sidebar-progress { display: none; }
.sidebar.collapsed .sidebar-bottom { padding: 9px 6px 10px; align-items: center; }
.sidebar.collapsed .refresh-btn { width: 28px; min-height: 28px; padding: 0; font-size: 0; gap: 0; }
/* step marquee: four-stage main progress bar, flowing glow on the current stage */
.sidebar-progress {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 2px 2px 4px;
}
.sidebar-progress-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.sidebar-progress-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-1);
}
.sidebar-progress-count {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
}
.sidebar-progress-track {
  display: flex;
  gap: 4px;
}
.sidebar-progress-seg {
  position: relative;
  flex: 1;
  height: 5px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: var(--overlay-track);
  cursor: pointer;
  overflow: hidden;
  transition: background 0.2s var(--ease-out), transform 0.15s var(--ease-out);
}
.sidebar-progress-seg:hover { transform: scaleY(1.6); }
.sidebar-progress-seg:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--button-focus);
}
.sidebar-progress-seg.done { background: var(--success); }
.sidebar-progress-seg.current { background: var(--accent-bg); }
/* Marquee flowing glow: the gradient highlight slides continuously within the current segment */
.sidebar-progress-seg.current .sidebar-progress-seg-fill {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg,
    var(--accent) 0%,
    color-mix(in srgb, var(--accent) 30%, #fff 70%) 50%,
    var(--accent) 100%);
  background-size: 220% 100%;
  animation: seg-marquee 1.5s linear infinite;
}
.sidebar-progress-seg:not(.current) .sidebar-progress-seg-fill { display: none; }
@keyframes seg-marquee {
  from { background-position: 220% 0; }
  to { background-position: -220% 0; }
}
.sidebar-progress-labels {
  display: flex;
  gap: 4px;
}
.sidebar-progress-labels span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  font-size: 10.5px;
  color: var(--text-3);
}
.sidebar-progress-labels span.done { color: var(--success); }
.sidebar-progress-labels span.on {
  color: var(--accent-text);
  font-weight: 700;
}
.refresh-btn {
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 28px;
  padding: 0 10px; font-size: 12.5px; font-weight: 650; color: var(--button-text);
  background: var(--button-bg); border: 1px solid var(--button-border); border-radius: var(--button-radius);
  cursor: pointer; transition: all 0.18s var(--ease-out);
  box-shadow: var(--button-shadow);
}
.refresh-btn:hover {
  background: var(--button-bg-hover);
  border-color: var(--button-border-hover);
  color: var(--button-text-hover);
  box-shadow: var(--button-shadow-hover);
}
.refresh-btn:focus-visible {
  outline: none;
  border-color: var(--action-primary);
  box-shadow: 0 0 0 3px var(--button-focus), var(--button-shadow-hover);
}

/* ===== Main Content ===== */
.main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; min-height: 0; border-radius: var(--radius); }
.content-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; min-height: 0; }
.stage-subnav {
  align-self: flex-start;
  margin: 4px 12px 0;
  max-width: calc(100% - 24px);
  overflow-x: auto;
  flex-shrink: 0;
}
.stage-subnav-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  /* override the global .seg-item{padding:7px 16px}, tighten the sub-nav height */
  padding: 4px 13px;
  font-size: 12px;
}
.stage-subnav-item.active {
  background: var(--seg-active-bg);
  color: var(--text-0);
  box-shadow: 0 1px 4px rgba(0,0,0,0.12);
}
.stage-subnav-item.done {
  color: var(--text-1);
}
.stage-subnav-item.active.done {
  color: var(--text-0);
}
.stage-subnav-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--success);
}

/* Toolbar */
.step-toolbar {
  display: flex; align-items: center; gap: 10px;
  min-height: 44px;
  padding: 8px 12px; border-bottom: 1px solid var(--border);
  background: var(--surface-raised); flex-shrink: 0;
}
.prod-toolbar { background: var(--surface-raised); }
.toolbar-left { display: flex; align-items: center; gap: 8px; flex: 1; }
.toolbar-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.step-indicator { display: flex; align-items: center; gap: 8px; }
.step-num {
  width: 26px; height: 26px; border-radius: 10px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--accent-bg);
  font-family: var(--font-mono); font-size: 10px; font-weight: 800; color: var(--accent-text); letter-spacing: 0.05em;
}
.step-name { font-size: 12.5px; font-weight: 700; color: var(--text-1); font-family: var(--font-display); }
.char-count { font-size: 11px; color: var(--text-3); font-family: var(--font-mono); }

/* Editor Area */
.step-editor { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.fill-textarea {
  flex: 1; border: none; border-radius: 0; padding: 26px 28px;
  font-size: 13.5px; line-height: 1.9; resize: none; outline: none;
  font-family: var(--font-body); background: var(--bg-input); color: var(--text-0);
}
.fill-textarea:focus { box-shadow: none; }

/* Step Empty State */
.step-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  flex: 1; min-height: 300px; gap: 10px; padding: 46px;
  animation: fadeIn 0.3s var(--ease-out);
}
.empty-visual {
  width: 72px; height: 72px; border-radius: 22px;
  background: var(--bg-1); color: var(--accent);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 8px;
}
.empty-title { font-size: 22px; font-weight: 700; font-family: var(--font-display); color: var(--text-0); }
.empty-desc { font-size: 13px; color: var(--text-2); max-width: 420px; text-align: center; line-height: 1.8; }
.step-empty-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center; }

/* Step Loading */
.step-loading {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  flex: 1; gap: 12px;
}
.loading-text { font-size: 13px; color: var(--text-2); }

.storyboard-ref-list {
  min-height: 0;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
/* when embedded in the middle column: no built-in padding; capped height with internal scroll, avoid pushing prompts below the fold */
.storyboard-ref-list.is-embedded { overflow: visible; padding: 0; }
.video-main-grid .storyboard-ref-list.is-embedded { max-height: 300px; overflow-y: auto; }
/* video list selection-mode shortcuts: reuse the segmented chip style, remove the top dashed separator */
.video-quick-actions { margin: 0 12px 10px; padding-top: 0; border-top: none; }
.storyboard-ref-group {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
}
.storyboard-ref-group + .storyboard-ref-group {
  margin-top: 4px;
}
.storyboard-ref-group-label {
  grid-column: 1 / -1;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: 0.02em;
  padding: 0 2px;
}
.storyboard-ref-goto {
  flex-shrink: 0;
  align-self: center;
  border: none;
  background: transparent;
  padding: 0 2px;
  border-radius: var(--radius-sm, 6px);
  font-size: 10.5px;
  font-weight: 600;
  color: var(--accent);
  cursor: pointer;
}
.storyboard-ref-goto:hover {
  background: var(--accent-bg);
}
.storyboard-ref-item {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  padding: 5px 7px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface-raised);
  cursor: pointer;
  transition: border-color 0.15s var(--ease-out), opacity 0.15s var(--ease-out);
}
.storyboard-ref-item:hover { border-color: var(--accent); }
.storyboard-ref-item:not(.bound) {
  background: transparent;
  border-color: var(--border);
  opacity: 0.72;
}
.storyboard-ref-item:not(.bound):hover { opacity: 1; border-color: var(--accent); }
.storyboard-ref-item:not(.bound) .storyboard-ref-main .storyboard-ref-name { color: var(--text-2); }
.storyboard-ref-item.bound {
  border-color: var(--accent);
  background: var(--accent-bg);
}
.storyboard-ref-item.bound:hover { border-color: var(--accent); }
.storyboard-ref-thumb {
  width: 30px;
  aspect-ratio: 1;
  border-radius: var(--radius-sm);
  border: 1px solid var(--surface-outline);
  overflow: hidden;
  background: var(--bg-2);
  color: var(--text-3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 800;
}
.storyboard-ref-thumb:disabled { cursor: default; }
.storyboard-ref-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.storyboard-ref-main { min-width: 0; display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px 6px; }
.storyboard-ref-name {
  flex: none;
  max-width: 42%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-0);
}
.storyboard-ref-state {
  flex-shrink: 0;
  margin-left: auto;
  font-size: 10px;
  color: var(--text-3);
}
.storyboard-ref-state.is-ready { color: var(--success); }
.storyboard-ref-meta {
  flex: 1;
  min-width: 0;
  font-size: 10.5px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.storyboard-ref-empty {
  padding: 14px 10px;
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.5;
  border: 1px dashed var(--surface-outline);
  border-radius: var(--radius);
}
.detail-panel { flex: 1; display: flex; flex-direction: column; overflow-y: auto; min-width: 0; }
.detail-head { display: flex; align-items: center; gap: 8px; padding: 9px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.detail-head-copy { display: flex; flex-direction: column; gap: 2px; }
.detail-head-title { font-size: 14px; font-weight: 700; color: var(--text-0); }
.detail-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.detail-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(220px, 0.9fr);
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  border: 1px solid var(--border);
}
.detail-hero-copy { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.detail-hero-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--text-3);
}
.detail-hero-text { font-size: 13px; color: var(--text-1); line-height: 1.7; }
.detail-status-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.detail-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  border: 1px solid var(--border);
}
.detail-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.detail-section-title { font-size: 12px; font-weight: 700; color: var(--text-0); }
.detail-section-copy { font-size: 11px; color: var(--text-3); }

/* Field */
.field { display: flex; flex-direction: column; gap: 5px; }
.field-label { font-size: 12px; font-weight: 500; color: var(--text-1); }
.field-row { display: flex; gap: 12px; }
.field-grid { display: grid; gap: 12px; }
.field-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.field-grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.locked-config {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: var(--surface-muted);
  border: 1px solid var(--surface-outline);
  color: var(--text-1);
  font-size: 11px;
  font-weight: 600;
}
.locked-config-banner {
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-2);
}

/* Production tabs */
.prod-tabs { display: flex; gap: 4px; background: var(--bg-2); border-radius: var(--radius); padding: 2px; }
.prod-tab {
  display: flex; align-items: center; gap: 4px; min-height: 26px; padding: 0 10px; font-size: 11px;
  border: 1px solid transparent; background: transparent; color: var(--text-2); cursor: pointer;
  border-radius: calc(var(--radius) - 2px); transition: all 0.18s var(--ease-out); font-weight: 650;
  line-height: 1;
}
.prod-tab:hover { color: var(--text-0); background: var(--button-bg); border-color: var(--button-border); }
.prod-tab.active { background: var(--accent-bg); color: var(--accent-text); font-weight: 650; border-color: var(--accent-glow); box-shadow: none; }
.prod-tab:focus-visible {
  outline: none;
  border-color: var(--action-primary);
  box-shadow: 0 0 0 3px var(--button-focus), var(--button-shadow);
}
.prod-tab-badge { font-size: 10px; font-family: var(--font-mono); padding: 0 4px; background: var(--bg-3); border-radius: 99px; }
.prod-tab.active .prod-tab-badge { background: var(--accent-bg); color: var(--accent-text); }

/* Production content */
.prod-content { flex: 1; overflow-y: auto; padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 10px; }
.prod-section-bar { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }

/* Asset bar actions: extract (neutral dashed) and batch generate (accent) visually grouped */
.asset-bar-actions { align-items: center; }
.asset-bar-divider { width: 1px; height: 16px; margin: 0 4px; background: var(--surface-outline-strong); }
.asset-btn-extract {
  background: transparent;
  color: var(--text-2);
  box-shadow: none;
  border: 1px dashed var(--surface-outline-strong);
}
.asset-btn-extract:hover { background: var(--surface-muted); color: var(--text-1); }
.asset-btn-batch {
  background: var(--accent-bg);
  color: var(--accent-text);
  box-shadow: none;
}
.asset-btn-batch:hover { background: var(--accent); color: var(--on-accent); }

/* asset section heading: add entry + card delete button */
.asset-section-title { display: flex; align-items: center; gap: 8px; }
.asset-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px dashed var(--surface-outline-strong);
  background: transparent;
  color: var(--text-3);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.asset-add-btn:hover { color: var(--accent-text); border-color: var(--accent-text); }
.character-asset-card, .asset-click-card { position: relative; }
.asset-del-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s;
}
.asset-del-btn:hover { background: var(--action-danger); }
.character-asset-card:hover .asset-del-btn,
.asset-click-card:hover .asset-del-btn { opacity: 1; }

/* Progress realtime per-card aset */
.asset-progress { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.asset-progress.is-dialog { flex: 1 1 100%; margin: 0 0 8px; }
.asset-detail-foot { flex-wrap: wrap; }
.asset-progress-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--text-2); }
.asset-progress-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset-progress-pct { font-variant-numeric: tabular-nums; color: var(--text-3); }
.asset-progress-track { height: 6px; border-radius: 999px; background: var(--bg-2); border: 1px solid var(--surface-outline); overflow: hidden; }
.asset-progress-fill { height: 100%; width: 0; border-radius: inherit; background: linear-gradient(90deg, var(--accent), var(--accent-text)); transition: width 0.8s linear; }
.asset-progress.is-prompt .asset-progress-fill { background: linear-gradient(90deg, var(--warning, #d97706), var(--accent)); }
.asset-progress.is-done .asset-progress-fill { background: var(--success); }
.asset-progress.is-failed .asset-progress-fill { background: var(--action-danger); }
.asset-progress.is-failed .asset-progress-label { color: var(--action-danger); }

/* Antrean sequential aset: status bar di bawah section header */
.asset-queue-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 7px 10px;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius);
  background: var(--accent-bg);
  color: var(--text-1);
  font-size: 12px;
}
.asset-queue-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Progress antrean video per baris */
.video-task-queue { color: var(--accent-text); font-size: 11px; font-weight: 600; white-space: nowrap; }
.video-task-progress-track { height: 5px; margin-top: 5px; border-radius: 999px; background: var(--bg-2); border: 1px solid var(--surface-outline); overflow: hidden; }
.video-task-progress-fill { height: 100%; width: 0; border-radius: inherit; background: linear-gradient(90deg, var(--accent), var(--accent-text)); transition: width 0.8s linear; }
.video-queue-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 0;
  padding: 7px 10px;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius);
  background: var(--accent-bg);
  color: var(--text-1);
  font-size: 12px;
}

/* Shot checkbox: batch generate video prompts after selection */
.shot-check {
  flex: none;
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1.5px solid var(--surface-outline-strong);
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--on-accent);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.shot-check:hover { border-color: var(--accent); }
.shot-check.on { background: var(--accent); border-color: var(--accent); }
.shot-quick-btn {
  border: none;
  background: transparent;
  color: var(--accent-text);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  white-space: nowrap;
}
.shot-quick-btn:hover { text-decoration: underline; }
/* Multi-select mode: header shortcuts on their own row, segmented chip style */
.shot-quick-actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--surface-outline);
}
.shot-quick-actions .shot-quick-btn {
  flex: 1;
  padding: 5px 0;
  border-radius: 6px;
  background: var(--bg-2);
  color: var(--text-2);
  text-align: center;
  transition: background 0.15s, color 0.15s;
}
.shot-quick-actions .shot-quick-btn:hover {
  background: var(--accent-bg);
  color: var(--accent-text);
  text-decoration: none;
}

/* add asset dialog */
.asset-create-dialog { width: 440px; max-width: calc(100vw - 48px); }
.asset-create-body { display: flex; flex-direction: column; gap: 10px; }

/* Asset grid */
.asset-section-title {
  margin-top: 2px;
  font-size: 12px;
  font-weight: 800;
  color: var(--text-1);
  letter-spacing: 0.04em;
}
.prop-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.prop-name-row .asset-name {
  min-width: 0;
}
.asset-props-empty {
  padding: 14px;
  border: 1px dashed var(--surface-outline);
  border-radius: var(--radius);
  color: var(--text-3);
  font-size: 12px;
  text-align: center;
}
.asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; align-items: stretch; }
.character-asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 260px));
  justify-content: start;
  gap: 10px;
}
.asset-card {
  display: flex; flex-direction: column; overflow: hidden;
  transition: transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out), border-color 0.18s var(--ease-out);
}
.asset-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-lift); }
.asset-click-card,
.character-asset-card {
  cursor: pointer;
}
.asset-click-card:focus-visible,
.character-asset-card:focus-visible {
  outline: none;
  border-color: var(--accent-glow);
  box-shadow: 0 0 0 3px var(--button-focus), var(--shadow-panel);
}
.character-asset-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  transition: transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out), border-color 0.18s var(--ease-out);
}
.character-asset-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lift);
  border-color: var(--border-strong);
}
.character-portrait {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  align-self: start;
  margin: 0;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius);
  background: var(--bg-2);
  overflow: hidden;
}
.character-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.character-portrait-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
}
.character-asset-main {
  min-width: 0;
  width: 100%;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.character-asset-overview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.character-asset-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.character-title-block {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.character-name-row {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  flex-wrap: wrap;
}
.character-name {
  font-size: 13px;
  line-height: 1.25;
  color: var(--text-0);
}
.character-gen-btn { flex-shrink: 0; align-self: center; }
.studio-model-picks {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-right: 12px;
  padding-right: 12px;
  border-right: 1px solid var(--border);
}
.asset-final-prompt {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 7px;
  border-top: 1px solid var(--border);
  font-size: 10.5px;
  line-height: 1.5;
}
.afp-label {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--text-3);
}
.afp-text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  word-break: break-word;
  color: var(--text-2);
}
.afp-text.dim { color: var(--text-3); }
.asset-final {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  word-break: break-word;
  color: var(--text-2);
}
.asset-final .afp-label { margin-right: 4px; }
.character-visual-summary {
  max-width: 100%;
  display: flex;
  gap: 8px;
  overflow: hidden;
  color: var(--text-3);
  font-size: 10.5px;
  line-height: 1.45;
  white-space: nowrap;
}
.character-visual-summary span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.asset-cover { position: relative; aspect-ratio: 1; background: var(--bg-2); overflow: hidden; }
.asset-cover.wide { aspect-ratio: 16/9; }
.asset-cover img { width: 100%; height: 100%; object-fit: cover; }
.previewable-image { cursor: zoom-in; transition: transform 0.18s var(--ease-out), filter 0.18s var(--ease-out); }
.previewable-image:hover { transform: scale(1.015); filter: saturate(1.04); }
.asset-cover-badge {
  position: absolute;
  top: 7px;
  left: 7px;
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(255,255,255,0.85);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  color: var(--text-2);
  font-size: 9.5px;
  font-weight: 700;
}
.asset-cover-badge.is-ready {
  background: var(--success-bg);
  color: var(--tag-success-text);
}
.asset-cover-badge.is-pending {
  background: var(--accent-bg);
  color: var(--accent-text);
}
.asset-cover-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); }
.asset-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 11px 8px;
  min-width: 0;
}
.asset-name {
  font-size: 13px;
  font-weight: 650;
  color: var(--text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.asset-meta { font-size: 11px; line-height: 1.5; }
.asset-desc {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  word-break: break-word;
}
.asset-light {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.asset-foot { display: flex; align-items: center; gap: 4px; padding: 7px 11px; border-top: 1px solid var(--border); }

/* Frame grid */
.frame-grid { display: flex; flex-direction: column; gap: 8px; }
.frame-row {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 14px; cursor: pointer;
  border-radius: var(--radius-lg);
  transition: all 0.15s;
  border: 1.5px solid transparent;
}
.frame-row:hover { background: var(--bg-0); border-color: var(--border); }
.frame-row.active {
  background: var(--bg-0);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}
.frame-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.frame-top { display: flex; align-items: center; gap: 8px; }
.frame-num {
  font-size: 13px; font-family: var(--font-mono); font-weight: 800;
  color: var(--accent);
}
.frame-badge {
  font-size: 11px; font-weight: 600; padding: 2px 8px;
  border-radius: 20px;
  background: var(--accent-bg); color: var(--accent);
  border: 1px solid var(--accent-glow);
  white-space: nowrap;
}
.frame-desc {
  font-size: 12px; line-height: 1.5; color: var(--text-1);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.frame-meta { display: flex; align-items: center; gap: 6px; }
.frame-thumbs { display: flex; gap: 8px; flex-shrink: 0; }
.frame-thumb-wrap { display: flex; flex-direction: column; gap: 3px; align-items: center; }
.frame-thumb-label { font-size: 10px; font-weight: 600; color: var(--text-3); }
.frame-thumb {
  position: relative; width: 130px; aspect-ratio: 16/9;
  border-radius: 6px; overflow: hidden;
  background: var(--bg-2); cursor: pointer;
  transition: all 0.15s; border: 1.5px solid var(--border);
}
.frame-thumb:hover { border-color: var(--accent); box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
.frame-thumb img { width: 100%; height: 100%; object-fit: cover; }
.frame-thumb-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); }
.frame-re {
  position: absolute; top: 3px; right: 3px; width: 18px; height: 18px;
  border-radius: 50%; background: rgba(0,0,0,0.5); color: #fff;
  display: none; align-items: center; justify-content: center;
}
.frame-thumb:hover .frame-re { display: flex; }
.frame-scroll { flex: 1; overflow-y: auto; padding: 10px 12px; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--bg-3); flex-shrink: 0; }
.dot.ok { background: var(--success); }
.dot.pending {
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

/* Video tasks */
.video-task-workbench {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(460px, 55%);
  overflow: hidden;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
}
.video-task-workbench.has-player {
  grid-template-columns: var(--vleft, 236px) minmax(0, 1fr);
}
.video-task-side {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--vright, 340px);
  border-left: 1px solid var(--border);
  background: var(--surface-muted);
}
/* three-column drag divider: transparent hotspot covers the boundary, lights up on hover/drag */
.video-col-divider {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 9px;
  z-index: 6;
  cursor: col-resize;
  touch-action: none;
}
.video-col-divider.is-left { left: calc(var(--vleft, 236px) - 4px); }
.video-col-divider.is-right { right: calc(var(--vright, 340px) - 4px); }
.video-col-divider::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 4px;
  width: 1px;
  background: transparent;
  transition: background 0.15s, box-shadow 0.15s;
}
.video-col-divider:hover::after,
.video-col-divider:active::after {
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent-glow);
}
:global(body.is-video-col-dragging) { cursor: col-resize; user-select: none; }
/* Middle column: pure edit area (storyboard description / atmosphere / video prompt), fills the height */
.video-main-col {
  min-width: 0;
  min-height: 0;
  display: flex;
}
.video-main-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 14px 16px 16px;
  background: var(--surface-raised);
}
/* Pre-generation checks in one screen: top two columns (image description / atmosphere | reference binding), bottom full width (video prompt) */
.video-main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.video-player-history {
  min-height: 0;
  padding: 8px 12px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-raised);
}
.video-player-history-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 7px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-2);
}
.video-player-history-count {
  padding: 0 6px;
  border-radius: 999px;
  background: var(--overlay-track);
  color: var(--text-3);
  font-size: 10px;
  font-weight: 750;
}
.video-player-history-list {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.video-history-item {
  position: relative;
  flex: 0 0 auto;
  width: 96px;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1.5px solid var(--surface-outline);
  border-radius: var(--radius);
  background: var(--media-surface);
  cursor: pointer;
  transition: border-color 0.16s var(--ease-out), box-shadow 0.16s var(--ease-out);
}
.video-history-item:hover { border-color: var(--border-strong); }
.video-history-item video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.video-history-item.current {
  border-color: var(--accent);
}
.video-history-item.viewing {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}
.video-history-time {
  position: absolute;
  left: 4px;
  bottom: 4px;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(0,0,0,0.6);
  color: #fff;
  font-family: var(--font-mono);
  font-size: 9px;
}
.video-history-badge {
  position: absolute;
  right: 4px;
  top: 4px;
  padding: 1px 5px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 9px;
  font-weight: 700;
}
.video-history-del {
  position: absolute;
  right: 3px;
  top: 3px;
  width: 16px;
  height: 16px;
  display: none;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  background: rgba(0,0,0,0.62);
  color: #fff;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}
.video-history-item:hover .video-history-del { display: flex; }
.video-task-player {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--border);
  background: var(--surface-raised);
}
.video-player-head {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 12px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--surface-outline);
}
.video-player-head-info {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.video-player-title { color: var(--text-0); font-size: 13px; font-weight: 700; white-space: nowrap; }
.video-player-sub { color: var(--text-3); font-size: 11px; white-space: nowrap; }
.video-player-stage {
  flex: none;
  aspect-ratio: 16 / 9;
  max-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--media-surface);
}
.video-player-video {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}
/* empty state: keep 16:9 player frame, content centered (icon + copy + generate button) */
.video-player-empty {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 6px;
  padding: 14px 16px;
  color: var(--text-3);
}
.video-player-empty-copy { display: flex; flex-direction: column; align-items: center; }
.video-player-empty-title { color: var(--text-1); font-size: 12.5px; font-weight: 700; }
.video-player-empty-desc { margin-top: 2px; font-size: 11px; line-height: 1.5; }
.video-player-empty-action { flex-shrink: 0; margin-top: 4px; }
.video-task-list {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 0;
  border-radius: 0;
  background: var(--surface-raised);
}
.video-task-head {
  min-height: 48px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--surface-outline);
}
.video-task-title {
  font-size: 13px;
  line-height: 1.2;
  font-weight: 850;
  color: var(--text-0);
}
.video-task-meta {
  margin-top: 3px;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-3);
}
.video-task-metrics {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
}
.video-task-metric,
.video-task-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 22px;
  padding: 0 8px;
  border: 1px solid var(--surface-outline);
  border-radius: 999px;
  background: var(--overlay-track);
  color: var(--text-2);
  font-size: 11px;
  font-weight: 750;
  white-space: nowrap;
}
.video-task-metric.is-done,
.video-task-status.is-done {
  color: var(--success);
  border-color: var(--success-bg);
  background: var(--success-bg);
}
.video-task-metric.is-pending,
.video-task-status.is-pending,
.video-task-status.is-ready {
  color: var(--accent-text);
  border-color: var(--accent-glow);
  background: var(--accent-bg);
}
.video-task-metric.is-failed,
.video-task-status.is-failed,
.video-task-status.is-blocked {
  color: var(--warning);
  border-color: var(--warning-bg);
  background: var(--warning-bg);
}
.video-task-table {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
/* stat badges double as filters */
button.video-task-metric { cursor: pointer; font-family: inherit; transition: box-shadow 0.15s; }
button.video-task-metric:hover { box-shadow: 0 0 0 2px var(--sel-glow); }
button.video-task-metric.on { box-shadow: 0 0 0 2px var(--accent); }
/* batch video: selection mode */
.btn.is-on { border-color: var(--accent); color: var(--accent-text); background: var(--accent-bg); }
.video-retry-failed { color: var(--warning); border-color: var(--warning-bg); }
.video-task-row.is-selected { background: var(--sel-bg); box-shadow: inset 0 0 0 1.5px var(--sel); }
.video-task-check {
  position: absolute;
  top: 5px;
  right: 5px;
  z-index: 2;
  background: rgba(0,0,0,0.45);
  border-color: rgba(255,255,255,0.55);
}
.video-task-check.on { background: var(--accent); border-color: var(--accent); }
/* Pre-generation effective config summary */
.video-inspector-effective {
  margin: 0;
  padding: 4px 8px;
  border: 1px solid var(--accent-glow);
  border-radius: var(--radius);
  background: var(--accent-bg);
  color: var(--accent-text);
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.4;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Generation params: accent card; duration is the core parameter for the current storyboard */
.video-params-card {
  padding: 7px 10px;
  border: 1px solid var(--accent-glow);
  border-radius: var(--radius-lg);
  background: var(--accent-bg);
}
/* moderation failure guidance */
.video-task-error-hint {
  margin-top: 3px;
  color: var(--accent-text);
  font-weight: 600;
}
/* batch generation confirm dialog */
.batch-video-dialog { width: 420px; max-width: calc(100vw - 48px); }
.batch-video-body { display: flex; flex-direction: column; gap: 10px; }
.batch-video-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: var(--text-2);
  padding: 8px 12px;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius);
  background: var(--bg-input);
}
.batch-video-row strong { color: var(--text-0); font-weight: 600; }
.batch-video-note { margin: 4px 0 0; font-size: 11px; color: var(--text-3); line-height: 1.6; }
.video-task-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-top: 1px solid var(--surface-outline);
  transition: background 0.16s var(--ease-out), border-color 0.16s var(--ease-out);
  cursor: pointer;
}
.video-task-row:first-child {
  border-top: 0;
}
.video-task-row:hover,
.video-task-row.is-pending {
  background: var(--bg-hover);
}
.video-task-row.is-failed {
  background: var(--error-bg);
}
.video-task-row.active {
  background: var(--sel-bg);
  box-shadow: inset 0 0 0 1.5px var(--sel), 0 0 0 3px var(--sel-glow);
}
.video-task-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.video-task-preview {
  position: relative;
  width: 56px;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius-sm);
  background: var(--bg-2);
}
.video-task-preview video,
.video-task-preview img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
.video-task-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
}
.video-task-index {
  position: absolute;
  left: 3px;
  top: 3px;
  padding: 0 4px;
  border-radius: 3px;
  background: rgba(0,0,0,0.56);
  color: #fff;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 800;
}
.video-task-main {
  min-width: 0;
}
.video-task-line {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.video-task-name {
  min-width: 0;
  font-size: 12px;
  line-height: 1.35;
  color: var(--text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.video-task-meta-line {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 2px;
  font-size: 10.5px;
  color: var(--text-3);
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
}
.video-task-loc {
  color: var(--text-2);
}
.video-task-sep { color: var(--text-3); opacity: 0.5; }
.video-task-error {
  margin-top: 5px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--error);
}
.video-task-error-hint {
  margin-top: 3px;
  color: var(--accent-text, var(--accent));
  font-weight: 600;
}
.video-task-status {
  justify-self: end;
  align-self: center;
}
/* inline compact status (for narrow lists): small dot + text */
.video-task-state {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  white-space: nowrap;
}
.video-task-state.is-done { color: var(--success); }
.video-task-state.is-pending { color: var(--accent-text); }
.video-task-state.is-failed { color: var(--warning); }
.video-task-action {
  justify-self: end;
  align-self: center;
  min-width: 0;
  width: 24px;
  height: 24px;
  padding: 0;
}
.video-task-inspector {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border);
  background: var(--surface-muted);
}
.video-task-inspector .video-task-player,
.video-task-inspector .video-player-history {
  flex: none;
}
.video-inspector-head {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--surface-outline);
}
.video-inspector-title { color: var(--text-0); font-size: 14px; font-weight: 700; }
.video-inspector-sub { margin-top: 2px; color: var(--text-3); font-size: 11px; }
.video-inspector-body { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; padding: 16px 18px 18px; }
/* Duration parameter + generate actions pinned to the bottom: does not scroll with the inspector */
.video-inspector-footer {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 9px 14px 11px;
  border-top: 1px solid var(--border);
  background: var(--surface-muted);
}
.video-inspector-section { display: flex; flex-direction: column; gap: 7px; }
.video-inspector-label { color: var(--text-0); font-size: 12px; font-weight: 700; }
.video-inspector-label-hero {
  color: var(--accent);
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.video-inspector-label-hero::before {
  content: '';
  width: 3px;
  height: 13px;
  border-radius: 2px;
  background: var(--accent);
}
.video-inspector-prompt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
/* MentionTextarea inner elements need :deep (scoped styles do not reach child internals by default) */
:deep(.video-inspector-prompt) {
  min-height: 176px;
  font-size: 13px;
  line-height: 1.6;
}
.video-inspector-params { display: grid; gap: 8px; }
.video-inspector-params div { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; }
.video-inspector-params dt { color: var(--text-3); }
.video-inspector-params dd { margin: 0; color: var(--text-1); text-align: right; }
.video-inspector-action { width: 100%; min-height: 32px; height: 32px; padding: 0 12px; font-size: 12.5px; }
/* Bound reference images: images of assets bound to the current storyboard, laid out in group order (submitted as reference images at generation) */
.video-bound-refs { display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 8px; }
.video-bound-ref {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius);
  background: var(--bg-2);
  color: var(--text-3);
  cursor: pointer;
  transition: border-color 0.15s var(--ease-out);
}
.video-bound-ref:hover { border-color: var(--accent); }
.video-bound-ref:disabled { cursor: default; }
.video-bound-ref:disabled:hover { border-color: var(--surface-outline); }
.video-bound-ref img { width: 100%; height: 100%; object-fit: cover; display: block; }
.video-bound-ref small {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 2px 5px;
  background: rgba(0,0,0,0.58);
  color: #fff;
  font-size: 9.5px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.video-bound-ref-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 11px; }
.video-bound-refs-empty { padding: 10px; border: 1px dashed var(--surface-outline); border-radius: var(--radius); color: var(--text-3); font-size: 11px; line-height: 1.5; }
.video-param-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; white-space: nowrap; }
.video-param-name { color: var(--text-1); font-weight: 600; flex-shrink: 0; }
.video-param-value { color: var(--text-1); text-align: right; font-size: 11px; }
.video-param-control { display: inline-flex; align-items: center; gap: 6px; }
.video-param-unit { font-size: 11px; color: var(--text-2); }
.video-duration-input { width: 56px; height: 24px; padding: 2px 6px; font-size: 12px; font-weight: 700; font-family: var(--font-mono); text-align: center; }

/* Prod grid */
.prod-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
.prod-card {
  display: flex; flex-direction: column; overflow: hidden;
  transition: transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out), border-color 0.18s var(--ease-out);
  border-radius: 20px;
  background: var(--surface-raised);
  border: 1px solid var(--surface-outline);
}
.prod-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-lift); }
.prod-cover { position: relative; aspect-ratio: 16/9; background: var(--bg-2); overflow: hidden; }
.prod-cover img { width: 100%; height: 100%; object-fit: cover; }
.prod-video { width: 100%; height: 100%; object-fit: cover; background: #000; display: block; }
.prod-cover-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); }
.prod-idx {
  position: absolute; top: 5px; left: 5px; font-size: 10px; font-weight: 700;
  font-family: var(--font-mono); background: rgba(0,0,0,0.5); color: #fff; padding: 1px 5px; border-radius: 3px;
}
.prod-overlay-badge {
  position: absolute; bottom: 5px; right: 5px; font-size: 10px; font-weight: 600;
  background: var(--success); color: var(--on-accent); padding: 1px 5px; border-radius: 3px;
}
.prod-info { padding: 10px 12px 8px; }
.prod-desc { font-size: 12px; line-height: 1.4; }
.prod-meta-line { margin-top: 5px; font-size: 10px; color: var(--text-3); }
.prod-dots { display: flex; align-items: center; gap: 4px; margin-top: 5px; color: var(--text-3); }
.prod-error {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--error);
}
.prod-actions { display: flex; gap: 6px; padding: 8px 10px 10px; border-top: 1px solid var(--surface-outline); }
.prod-actions .btn { flex: 1; justify-content: center; }

/* Asset detail dialog */
.asset-detail-overlay {
  z-index: 118;
  padding: 28px;
}
.asset-detail-dialog {
  width: min(1040px, calc(100vw - 56px));
  max-height: calc(100vh - 56px);
}
.asset-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--surface-outline);
}
.asset-detail-title-block {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.asset-detail-kicker {
  color: var(--text-3);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.asset-detail-title {
  margin: 0;
  color: var(--text-0);
  font-size: 18px;
  line-height: 1.2;
  font-family: var(--font-display);
}
.asset-detail-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.asset-detail-body {
  min-height: 0;
  overflow: auto;
  padding: 16px;
}
.asset-detail-shell {
  display: grid;
  grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.asset-detail-preview-panel,
.asset-detail-editor-panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.asset-detail-preview-panel {
  position: sticky;
  top: 0;
}
.asset-detail-section-title {
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--text-1);
  font-size: 12px;
  font-weight: 820;
  letter-spacing: 0.02em;
}
.asset-detail-section-title .dim {
  font-size: 11px;
  font-weight: 560;
  letter-spacing: 0;
  text-align: right;
}
.asset-detail-state {
  min-height: 20px;
  display: inline-flex;
  align-items: center;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--overlay-track);
  color: var(--text-3);
  font-size: 10px;
  font-weight: 760;
  white-space: nowrap;
}
.asset-detail-state.is-ready {
  color: var(--success);
  background: var(--success-bg);
}
.asset-detail-media-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  display: block;
  padding: 0;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius);
  background: var(--bg-2);
  color: var(--text-3);
  overflow: hidden;
  cursor: zoom-in;
}
.asset-detail-media-frame:disabled {
  cursor: default;
  opacity: 1;
}
.asset-detail-media-frame:focus-visible {
  outline: none;
  border-color: var(--action-primary);
  box-shadow: 0 0 0 3px var(--button-focus);
}
.asset-detail-media-frame img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
.asset-detail-media-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
}
.asset-detail-desc {
  margin: 0;
  color: var(--text-1);
  font-size: 13px;
  line-height: 1.7;
}
.asset-detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.asset-detail-field {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius);
  background: var(--surface-muted);
}
.asset-detail-field span,
.asset-detail-edit-field span,
.asset-detail-text-block span,
.asset-detail-shot-head {
  display: block;
  color: var(--text-3);
  font-size: 10px;
  font-weight: 780;
  letter-spacing: 0.04em;
}
.asset-detail-field strong {
  display: block;
  margin-top: 5px;
  min-width: 0;
  overflow: hidden;
  color: var(--text-0);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asset-detail-text-block {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.asset-detail-edit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.asset-detail-edit-grid--character,
.asset-detail-edit-grid--scene {
  grid-template-columns: 1fr;
}
.asset-detail-edit-field {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.asset-detail-textarea {
  min-height: 138px;
  resize: vertical;
}
.asset-detail-edit-grid--character .asset-detail-textarea,
.asset-detail-edit-grid--scene .asset-detail-textarea {
  min-height: 164px;
}
.asset-detail-meta-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.asset-detail-meta-item {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius);
  background: var(--surface-muted);
}
.asset-detail-meta-item span {
  display: block;
  color: var(--text-3);
  font-size: 10px;
  font-weight: 780;
  letter-spacing: 0.04em;
}
.asset-detail-meta-item strong {
  display: block;
  margin-top: 4px;
  min-width: 0;
  color: var(--text-0);
  font-size: 12px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asset-detail-text-block > div,
.asset-detail-shot-list {
  padding: 10px;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius);
  background: var(--surface-muted);
}
.asset-detail-text-block p {
  margin: 5px 0 0;
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.55;
}
.asset-detail-shot-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.asset-detail-shot-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.asset-detail-shot-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  color: var(--text-2);
  font-size: 11px;
}
.asset-detail-shot-row strong {
  min-width: 0;
  overflow: hidden;
  color: var(--text-1);
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asset-detail-shot-row small,
.asset-detail-empty {
  color: var(--text-3);
  font-size: 11px;
}
.asset-detail-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--surface-outline);
}
.asset-detail-secondary-actions,
.asset-detail-primary-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.asset-detail-prompt-panel {
  min-width: 0;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--surface-outline);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.asset-detail-prompt-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.asset-detail-copy-btn {
  gap: 5px;
}
.asset-detail-prompt-textarea {
  min-height: 96px;
  max-height: 260px;
  overflow: auto;
  padding: 12px 14px;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius);
  background: var(--surface-muted);
  color: var(--text-1);
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  resize: vertical;
  width: 100%;
}
.asset-detail-prompt-hint {
  margin: 0;
  color: var(--text-3);
  font-size: 11px;
  line-height: 1.5;
}
.asset-detail-autoimg {
  margin-top: 2px;
}
.switch-row {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  min-height: 27px;
}
.switch-hint {
  margin: 0;
}
.asset-detail-readonly-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.asset-detail-readonly {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius);
  background: var(--surface-muted);
}
.asset-detail-readonly span {
  display: block;
  color: var(--text-3);
  font-size: 10px;
  font-weight: 780;
  letter-spacing: 0.04em;
}
.asset-detail-readonly p {
  margin: 6px 0 0;
  color: var(--text-1);
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
}
.asset-detail-readonly p.dim {
  color: var(--text-3);
}

/* Image viewer */
.image-viewer-overlay {
  z-index: 120;
  padding: 28px;
}
.image-viewer-dialog {
  width: min(1100px, calc(100vw - 56px));
  max-height: calc(100vh - 56px);
  background: var(--header-bg);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
}
.image-viewer-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--surface-outline);
}
.image-viewer-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
  font-family: var(--font-display);
}
.image-viewer-body {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow: auto;
  min-height: 0;
}
.image-viewer-img {
  display: block;
  max-width: 100%;
  max-height: calc(100vh - 140px);
  border-radius: 18px;
  box-shadow: var(--shadow-xl);
  background: var(--surface-muted);
}

/* Export */
.export-split { flex: 1; display: flex; min-height: 0; }
.export-main { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; align-items: stretch; gap: 18px; padding: 16px 20px 24px; }
.export-section { display: flex; flex-direction: column; min-height: 0; }
.export-section-grow { flex: 1; }
.export-section-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.export-section-title { font-size: 13px; font-weight: 800; color: var(--text-0); }
.export-merge-strip { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; }
.merge-card {
  flex: 0 0 auto;
  width: 260px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-radius: var(--radius);
  background: var(--surface-raised);
  border: 1px solid var(--border);
}
.merge-card video {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 6px;
  background: var(--media-surface);
  display: block;
}
.merge-card-pending {
  width: 100%;
  aspect-ratio: 16 / 9;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  border-radius: 6px;
  background: var(--surface-muted);
  color: var(--text-3);
  font-size: 11px;
  text-align: center;
}
.merge-card-pending.is-failed { color: var(--error); background: var(--error-bg); }
.merge-card-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-3); min-width: 0; }
.merge-card-meta .btn { margin-left: auto; }
.merge-card.playable { cursor: pointer; }
.merge-card.playable:hover { border-color: var(--border-strong); box-shadow: var(--shadow-card); }
.merge-card-thumb { position: relative; }
.merge-card-play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(0,0,0,0.28);
  color: #fff;
  opacity: 0;
  transition: opacity 0.15s var(--ease-out);
  pointer-events: none;
}
.merge-card.playable:hover .merge-card-play { opacity: 1; }
.merge-viewer-dialog { width: min(1080px, calc(100vw - 56px)); }
.merge-viewer-body {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  min-height: 0;
}
.merge-viewer-video {
  width: 100%;
  max-height: calc(100vh - 220px);
  border-radius: var(--radius);
  background: #000;
  display: block;
}
.export-merge-empty {
  padding: 14px;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  color: var(--text-3);
  font-size: 12px;
  text-align: center;
}
.export-subtitle-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-3);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.export-subtitle-toggle input[type="checkbox"] {
  width: 13px;
  height: 13px;
  accent-color: var(--primary);
  cursor: pointer;
}
.export-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  align-content: start;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}
.exp-card { display: flex; flex-direction: column; align-items: stretch; gap: 6px; padding: 8px; border-radius: var(--radius); background: var(--surface-raised); border: 1px solid var(--border); }
.exp-card:hover { border-color: var(--border-strong); box-shadow: var(--shadow-card); }
.exp-card.playable { cursor: pointer; }
.exp-card.selected { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-glow); }
.exp-check {
  position: absolute;
  right: 6px;
  top: 6px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.9);
  background: rgba(0,0,0,0.35);
  color: #fff;
}
.exp-check.on { background: var(--accent); border-color: var(--accent); }
.exp-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid var(--surface-outline);
  border-radius: 6px;
  background: var(--media-surface);
}
.exp-thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }
.exp-thumb-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); }
.exp-thumb-index {
  position: absolute;
  left: 5px;
  top: 5px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(0,0,0,0.56);
  color: #fff;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 800;
}
.exp-thumb-duration {
  position: absolute;
  right: 5px;
  bottom: 5px;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(0,0,0,0.6);
  color: #fff;
  font-family: var(--font-mono);
  font-size: 9px;
}
/* shot preview: centered play button appears on hover, click to open the preview dialog (does not affect the card checkbox) */
.exp-play {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%) scale(0.9);
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0,0,0,0.62);
  color: #fff;
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s, background 0.15s;
}
.exp-card:hover .exp-play { opacity: 1; transform: translate(-50%, -50%) scale(1); }
.exp-play:hover { background: var(--accent); }
/* manual export-complete button */
.export-done-btn.on {
  background: var(--success-bg, var(--accent-bg));
  color: var(--success, var(--accent-text));
  border-color: transparent;
  font-weight: 600;
}
.exp-row-line { display: flex; align-items: center; gap: 8px; min-width: 0; }

/* Shared */
.dim { color: var(--text-3); }

@media (max-width: 1080px) {
  .studio-topbar .topbar-back {
    min-width: 0;
    padding: 0 8px;
  }
  .studio-topbar .topbar-back .back-label {
    display: none;
  }

  .studio-body {
    grid-template-columns: 1fr;
  }

  .video-task-workbench.has-player {
    grid-template-columns: var(--vleft, 208px) minmax(0, 1fr);
  }

  .video-task-side {
    grid-template-columns: minmax(0, 1fr) var(--vright, 260px);
  }

  .video-main-grid {
    grid-template-columns: 1fr;
  }

  .split-layout,
  .export-split {
    flex-direction: column;
  }

  .sb-scene-select { max-width: none; flex: 1; }

  .detail-panel {
    min-height: 420px;
  }

  .field-grid-4 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .character-asset-grid {
    grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  }

  .video-task-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .video-task-metrics {
    width: 100%;
    margin-left: 0;
    justify-content: flex-start;
  }

  .video-task-row {
    grid-template-columns: 56px minmax(0, 1fr);
  }

  .video-task-action {
    justify-self: start;
  }

  .image-viewer-overlay {
    padding: 16px;
  }

  .image-viewer-dialog {
    width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
  }

  .asset-detail-overlay {
    padding: 16px;
  }

  .asset-detail-dialog {
    width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
  }

  .asset-detail-shell {
    grid-template-columns: 1fr;
  }

  .asset-detail-preview-panel {
    position: static;
  }

  .asset-detail-grid,
  .asset-detail-edit-grid,
  .asset-detail-text-block {
    grid-template-columns: 1fr;
  }

}

/* ===== task list panel ===== */
.gen-task-row {
  grid-template-columns: 84px minmax(0, 1fr) auto;
  cursor: default;
}
.gen-task-row .video-task-preview img {
  cursor: zoom-in;
}

/* task trigger button(top bar) */
.task-drawer-trigger {
  position: relative;
}
.task-drawer-badge {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--action-primary-text);
  font-size: 10px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

/* right drawer */
.task-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 118;
  display: flex;
  justify-content: flex-end;
  background: var(--scrim);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: fadeIn 0.18s var(--ease-out);
}
.task-drawer {
  width: min(560px, 100vw);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--panel-bg);
  border-left: 1px solid var(--panel-border);
  box-shadow: var(--shadow-xl);
  animation: taskDrawerIn 0.22s var(--ease-out);
}
@keyframes taskDrawerIn {
  from { transform: translateX(24px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
.task-drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--surface-outline);
}
.task-drawer-head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.task-drawer-metrics {
  padding: 10px 16px;
  border-bottom: 1px solid var(--surface-outline);
}
.task-drawer-body {
  flex: 1;
  overflow-y: auto;
}
.task-drawer-empty {
  flex: 1;
  justify-content: center;
}

@media (max-width: 860px) {
  .studio {
    padding: 8px;
    gap: 8px;
  }

  .studio-topbar-main {
    align-items: flex-start;
  }

  .studio-topbar {
    flex-direction: column;
    align-items: stretch;
  }

  .studio-topbar-side {
    justify-content: space-between;
  }

  .sidebar {
    max-height: 340px;
  }

  .studio-topbar-side,
  .studio-actions {
    flex-wrap: wrap;
  }

  .toolbar-right,
  .export-bar {
    flex-wrap: wrap;
  }

  .asset-grid,
  .character-asset-grid,
  .prod-grid {
    grid-template-columns: 1fr;
  }

  .character-asset-card {
    min-height: 0;
  }

  .character-asset-overview {
    grid-template-columns: 1fr;
  }

  .character-portrait {
    width: auto;
  }

  .character-asset-main {
    padding: 10px;
  }

  .character-asset-head {
    align-items: stretch;
    flex-direction: column;
  }

  .video-task-workbench {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  /* no column dividers after vertical stacking on narrow screens, hide the drag divider */
  .video-col-divider { display: none; }

  .video-task-inspector {
    border-top: 1px solid var(--surface-outline);
    border-left: 0;
  }

  .video-task-side {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--surface-outline);
    border-left: 0;
  }

  /* narrow screens: middle column switches to a vertical stack, the outer workbench scrolls as a whole */
  .video-main-col {
    display: flex;
    flex-direction: column;
    flex: none;
  }

  .video-main-scroll {
    flex: none;
    overflow: visible;
  }

  .video-task-side .video-task-inspector {
      flex: none; /* on narrow screens the outer workbench scrolls as a whole; inspector expands to its content and does not shrink with flex */
    border-top: 0;
    display: flex;
    flex-direction: column;
    overflow: visible;
  }

  .video-inspector-body {
    overflow: visible;
  }

  .video-task-player {
    flex: none; /* no shrink: otherwise stage min-height overflows the player and covers the inspector */
  }

  .video-player-stage {
    flex: none;
    max-height: 220px;
  }

  .frame-row {
    flex-direction: column;
    align-items: stretch;
  }

  .detail-hero {
    grid-template-columns: 1fr;
  }

  .field-grid-2,
  .field-grid-4 {
    grid-template-columns: 1fr;
  }

  .frame-thumbs {
    width: 100%;
  }

  .frame-thumb {
    width: 100%;
  }

}
</style>
