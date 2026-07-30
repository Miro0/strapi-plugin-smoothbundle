'use strict';

const { nowIso } = require('../../utils/helpers');
const pluginId = require('../../plugin-id');

function sanitizeProject(entry = {}, current = {}) {
  const merged = {
    ...current,
    ...(entry && typeof entry === 'object' ? entry : {}),
  };

  return {
    projectId: String(merged.projectId || '').trim(),
    projectType: String(merged.projectType || '').trim(),
    projectSlug: String(merged.projectSlug || '').trim(),
    assetsCount: Math.max(0, Number(merged.assetsCount) || 0),
    customSubdomain: String(merged.customSubdomain || '').trim(),
  };
}

function sanitizeStatusSummary(entry = {}, current = {}) {
  const merged = {
    ...current,
    ...(entry && typeof entry === 'object' ? entry : {}),
  };

  return {
    requests: Math.max(0, Number(merged.requests) || 0),
    maxRequests: Math.max(0, Number(merged.maxRequests) || 0),
    bandwidth: Math.max(0, Number(merged.bandwidth) || 0),
    maxBandwidth: Math.max(0, Number(merged.maxBandwidth) || 0),
    assetsPerProject: Math.max(0, Number(merged.assetsPerProject) || 0),
    periodEnd: String(merged.periodEnd || '').trim(),
  };
}

module.exports = ({ strapi }) => ({
  defaults() {
    return {
      accessToken: '',
      connected: false,
      authKeyId: '',
      authVerificationUrl: '',
      authSessionStatus: 'idle',
      authMode: '',
      moduleProjects: {},
      statusSummary: {
        requests: 0,
        maxRequests: 0,
        bandwidth: 0,
        maxBandwidth: 0,
        assetsPerProject: 0,
        periodEnd: '',
      },
      userSlug: '',
      userName: '',
      userEmail: '',
      userPlan: -1,
      userPlanLabel: '',
      guestName: '',
      publicBaseUrl: '',
      lastConnectionAt: '',
      lastStatusSyncAt: '',
      lastProjectCreationAt: '',
      lastAuthStartedAt: '',
    };
  },

  store() {
    return strapi.store({
      type: 'plugin',
      name: pluginId,
      key: 'core-settings',
    });
  },

  sanitize(payload = {}, current = this.defaults()) {
    const defaults = this.defaults();
    const merged = {
      ...defaults,
      ...current,
      ...payload,
    };
    const accessToken = String(merged.accessToken || merged.apiKey || '').trim();
    const currentModuleProjects =
      current.moduleProjects && typeof current.moduleProjects === 'object' ? current.moduleProjects : {};
    const incomingModuleProjects =
      merged.moduleProjects && typeof merged.moduleProjects === 'object' ? merged.moduleProjects : {};
    const moduleProjects = {};
    const statusSummary = sanitizeStatusSummary(merged.statusSummary, current.statusSummary);

    for (const [moduleId, project] of Object.entries({
      ...currentModuleProjects,
      ...incomingModuleProjects,
    })) {
      const normalizedModuleId = String(moduleId || '').trim();
      if (!normalizedModuleId) {
        continue;
      }

      const sanitizedProject = sanitizeProject(project, currentModuleProjects[normalizedModuleId]);

      if (!sanitizedProject.projectId && !sanitizedProject.projectSlug && !sanitizedProject.projectType) {
        continue;
      }

      moduleProjects[normalizedModuleId] = sanitizedProject;
    }

    const hasLegacyProject = merged.projectId || merged.projectSlug || merged.projectType;
    if (
      hasLegacyProject &&
      !moduleProjects['api-accelerator']
    ) {
      const legacyProject = sanitizeProject({
        projectId: merged.projectId,
        projectSlug: merged.projectSlug,
        projectType: merged.projectType,
      });

      if (legacyProject.projectId || legacyProject.projectSlug || legacyProject.projectType) {
        moduleProjects['api-accelerator'] = legacyProject;
      }
    }

    return {
      accessToken,
      connected: Boolean(merged.connected),
      authKeyId: String(merged.authKeyId || '').trim(),
      authVerificationUrl: String(merged.authVerificationUrl || '').trim(),
      authSessionStatus: ['idle', 'pending', 'active', 'expired', 'already_active', 'invalid', 'error'].includes(
        String(merged.authSessionStatus || '')
      )
        ? String(merged.authSessionStatus)
        : 'idle',
      authMode: ['browser', 'guest', ''].includes(String(merged.authMode || '')) ? String(merged.authMode) : '',
      moduleProjects,
      statusSummary,
      userSlug: String(merged.userSlug || '').trim(),
      userName: String(merged.userName || '').trim(),
      userEmail: String(merged.userEmail || '').trim(),
      userPlan: Number.isFinite(Number(merged.userPlan)) ? Number(merged.userPlan) : -1,
      userPlanLabel: String(merged.userPlanLabel || '').trim(),
      guestName: String(merged.guestName || '').trim(),
      publicBaseUrl: String(merged.publicBaseUrl || '').trim().replace(/\/+$/, ''),
      lastConnectionAt: String(merged.lastConnectionAt || '').trim(),
      lastStatusSyncAt: String(merged.lastStatusSyncAt || '').trim(),
      lastProjectCreationAt: String(merged.lastProjectCreationAt || '').trim(),
      lastAuthStartedAt: String(merged.lastAuthStartedAt || '').trim(),
    };
  },

  async get() {
    const stored = (await this.store().get()) || {};
    return this.sanitize(stored);
  },

  async update(payload = {}, options = {}) {
    const current = await this.get();
    const nextPayload = { ...payload };

    if (options.preserveAccessToken !== false && Object.prototype.hasOwnProperty.call(nextPayload, 'accessToken')) {
      const candidate = String(nextPayload.accessToken || '').trim();
      if (!candidate && current.accessToken) {
        delete nextPayload.accessToken;
      }
    }

    const next = this.sanitize(nextPayload, current);

    if (!next.accessToken) {
      next.connected = false;
      next.authKeyId = '';
      next.authVerificationUrl = '';
      next.authSessionStatus = 'idle';
      next.authMode = '';
      next.moduleProjects = {};
      next.statusSummary = sanitizeStatusSummary();
      next.userSlug = '';
      next.userName = '';
      next.userEmail = '';
      next.userPlan = -1;
      next.userPlanLabel = '';
    }

    await this.store().set({ value: next });
    return next;
  },

  async resetPluginDataPreservingAccount() {
    const current = await this.get();
    const next = this.sanitize(
      {
        accessToken: current.accessToken,
        connected: current.connected,
        authKeyId: current.authKeyId,
        authVerificationUrl: current.authVerificationUrl,
        authSessionStatus: current.authSessionStatus,
        authMode: current.authMode,
        userSlug: current.userSlug,
        userName: current.userName,
        userEmail: current.userEmail,
        userPlan: current.userPlan,
        userPlanLabel: current.userPlanLabel,
        guestName: current.guestName,
        publicBaseUrl: current.publicBaseUrl,
        lastConnectionAt: current.lastConnectionAt,
        lastStatusSyncAt: current.lastStatusSyncAt,
        lastAuthStartedAt: current.lastAuthStartedAt,
        statusSummary: current.statusSummary,
        moduleProjects: {},
        lastProjectCreationAt: '',
      },
      this.defaults()
    );

    await this.store().set({ value: next });
    return next;
  },

  async markPendingAuth(payload = {}) {
    return this.update({
      authKeyId: payload.authKeyId || payload.keyId || '',
      authVerificationUrl: payload.authVerificationUrl || payload.verificationUrl || '',
      authSessionStatus: payload.authSessionStatus || payload.status || 'pending',
      authMode: payload.authMode || payload.mode || '',
      lastAuthStartedAt: nowIso(),
    });
  },

  async clearPendingAuth(status = 'idle') {
    return this.update({
      authKeyId: '',
      authVerificationUrl: '',
      authSessionStatus: status,
      authMode: '',
    });
  },

  async markConnected(connection = {}) {
    return this.update({
      ...connection,
      connected: true,
      authKeyId: '',
      authVerificationUrl: '',
      authSessionStatus: 'idle',
      authMode: '',
      lastConnectionAt: nowIso(),
    });
  },

  async markStatus(payload = {}) {
    return this.update({
      ...payload,
      lastStatusSyncAt: nowIso(),
    });
  },

  async getProject(moduleId) {
    const settings = await this.get();
    const normalizedModuleId = String(moduleId || '').trim();
    return sanitizeProject(settings.moduleProjects?.[normalizedModuleId]);
  },

  async markProjectCreated(moduleId, payload = {}) {
    const settings = await this.get();
    const normalizedModuleId = String(moduleId || '').trim();

    if (!normalizedModuleId) {
      return settings;
    }

    const nextModuleProjects = {
      ...settings.moduleProjects,
      [normalizedModuleId]: sanitizeProject(payload, settings.moduleProjects?.[normalizedModuleId]),
    };

    return this.update({
      moduleProjects: nextModuleProjects,
      lastProjectCreationAt: nowIso(),
    });
  },

  async markDisconnected() {
    return this.update(
      {
        accessToken: '',
        connected: false,
        authKeyId: '',
        authVerificationUrl: '',
        authSessionStatus: 'idle',
        authMode: '',
        moduleProjects: {},
        statusSummary: sanitizeStatusSummary(),
        userSlug: '',
        userName: '',
        userEmail: '',
        userPlan: -1,
        userPlanLabel: '',
        lastConnectionAt: '',
        lastStatusSyncAt: '',
        lastProjectCreationAt: '',
        lastAuthStartedAt: '',
      },
      {
        preserveAccessToken: false,
      }
    );
  },

  async isConnected() {
    const settings = await this.get();
    return Boolean(settings.accessToken && settings.connected);
  },
});
