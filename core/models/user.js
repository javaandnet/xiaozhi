const BaseModel = require('./base');

class UserModel extends BaseModel {
  constructor(data = {}) {
    super(data);
    this.username = data.username || '';
    this.email = data.email || '';
    this.role = data.role || 'user'; // user, admin
    this.avatar = data.avatar || '';
    this.preferences = data.preferences || {};
    this.lastLogin = data.lastLogin || null;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      username: this.username,
      email: this.email,
      role: this.role,
      avatar: this.avatar,
      preferences: this.preferences,
      lastLogin: this.lastLogin
    };
  }

  updateLastLogin() {
    this.lastLogin = new Date();
    this.updatedAt = new Date();
  }

  isAdmin() {
    return this.role === 'admin';
  }

  static validate(data) {
    const errors = [];
    
    if (!data.username) {
      errors.push('用户名不能为空');
    }
    
    if (!data.email) {
      errors.push('邮箱不能为空');
    } else if (!/\S+@\S+\.\S+/.test(data.email)) {
      errors.push('邮箱格式不正确');
    }
    
    const validRoles = ['user', 'admin'];
    if (data.role && !validRoles.includes(data.role)) {
      errors.push(`无效的用户角色: ${data.role}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = UserModel;