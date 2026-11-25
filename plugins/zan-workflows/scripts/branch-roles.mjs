export const COMMON_MAIN_BRANCHES = Object.freeze(['master', 'main']);
export const LEGACY_TEST_BRANCHES = Object.freeze(['dev', 'develop']);
export const COMMON_TEST_BRANCHES = Object.freeze([...LEGACY_TEST_BRANCHES, 'test']);

export function isBranchName(name) {
  if (typeof name !== 'string' || !name || name === 'HEAD' || name === '@' ||
      name.startsWith('-') || name.endsWith('.') || name.includes('..') || name.includes('@{') ||
      /[\x00-\x20\x7f~^:?*\[\\]/.test(name)) return false;
  return name.split('/').every(part => part && !part.startsWith('.') && !part.endsWith('.lock'));
}

export function isTestBranch(branch, declared) {
  return isBranchName(branch) && (declared === undefined
    ? COMMON_TEST_BRANCHES.includes(branch)
    : branch === declared);
}

export function deliveryTargetKind({ targetBranch, testBranch }, defaultBranch) {
  if (!isBranchName(defaultBranch) || !isBranchName(targetBranch) ||
      (testBranch !== undefined && !isBranchName(testBranch))) {
    throw new Error('Git 交付需要准确的远端默认分支和目标分支');
  }
  if (targetBranch === defaultBranch) {
    if (testBranch === targetBranch) throw new Error('远端默认分支不能作为提测目标');
    return 'production';
  }
  if (isTestBranch(targetBranch, testBranch)) return 'test';
  throw new Error(`${targetBranch} 未验证为实际默认分支或已确认的提测分支，需要更新清单`);
}

export function isMainDelivery(receipt) {
  if (receipt?.defaultTargetVerified !== true || receipt.testTargetVerified === true) return false;
  const { targetBranch, defaultBranch } = receipt;
  return isBranchName(targetBranch) && (defaultBranch === undefined
    ? COMMON_MAIN_BRANCHES.includes(targetBranch)
    : defaultBranch === targetBranch);
}

export function isTestDelivery(receipt) {
  if (!receipt || receipt.defaultTargetVerified === true || receipt.targetBranch === receipt.defaultBranch) return false;
  if (receipt.testTargetVerified === undefined) return LEGACY_TEST_BRANCHES.includes(receipt.targetBranch);
  return receipt.testTargetVerified === true && isBranchName(receipt.defaultBranch) && isBranchName(receipt.targetBranch);
}
