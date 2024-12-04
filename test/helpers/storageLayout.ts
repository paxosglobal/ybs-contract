import hre from 'hardhat';
import { parseFullyQualifiedName } from 'hardhat/utils/contract-names';

interface StorageEntry {
  label: string;
  type: string;
  bytesStart: number;
  bytesEnd: number;
  slot?: number;
  offset?: number;
  currentVarSize?: number;
}

interface ComparisonEntry {
  bytesStart: number;
  bytesEnd: number;
  entryOld?: string;
  entryNew?: string;
  changed: string;
}

function isEqual(entryOld: StorageEntry, entryNew: StorageEntry): boolean {
  return entryOld.type === "EMPTY" || entryOld.type === entryNew.type;
}

async function getStorageLayout(fullyQualifiedName: string): Promise<StorageEntry[]> {
  const info = await hre.artifacts.getBuildInfo(fullyQualifiedName);
  if (!info) throw new Error(`Build info not found for ${fullyQualifiedName}`);
  
  const { sourceName, contractName } = parseFullyQualifiedName(fullyQualifiedName);
  const contractInfo = info.output.contracts[sourceName][contractName] as any;
  const storage = contractInfo.storageLayout.storage;
  const types = contractInfo.storageLayout.types;

  return storage.reduce((storageLayout: StorageEntry[], { label, offset, slot, type }: any) => {
    const slotSize = 32;

    const currentVarSize = parseInt(types[type].numberOfBytes);
    slot = parseInt(slot);
    offset = parseInt(offset);

    const bytesStart = slot * slotSize + offset;
    const bytesEnd = bytesStart + currentVarSize - 1;

    // append gaps left in the previous storage slot.
    const prevBytesEnd = storageLayout.length > 0 ? storageLayout[storageLayout.length - 1].bytesEnd : -1;
    if (bytesStart > prevBytesEnd + 1) {
      storageLayout.push({ label: 'EMPTY', type: 'EMPTY', bytesStart: prevBytesEnd + 1, bytesEnd: bytesStart - 1 });
    }
    storageLayout.push({ label, type: types[type].label, slot, offset, currentVarSize, bytesStart, bytesEnd });

    return storageLayout;
  }, []);
}

function compareStorageLayouts(storageOld: StorageEntry[], storageNew: StorageEntry[]): ComparisonEntry[] {
  let bytesIndex = 0;
  const storageOldLength = storageOld.length;
  const storageNewLength = storageNew.length;
  let indexOld = 0;
  let indexNew = 0;
  let comparisonTable: ComparisonEntry[] = [];

  // Values exist in both the iterators
  while (indexOld < storageOldLength && indexNew < storageNewLength) {
    const [entryOld, entryNew] = [storageOld[indexOld], storageNew[indexNew]];
    const [bytesEndOld, bytesEndNew] = [entryOld.bytesEnd, entryNew.bytesEnd];

    const currBytesEndMin = Math.min(bytesEndOld, bytesEndNew);
    comparisonTable.push({
      bytesStart: bytesIndex,
      bytesEnd: currBytesEndMin,
      entryOld: `${entryOld.label}: ${entryOld.type}`,
      entryNew: `${entryNew.label}: ${entryNew.type}`,
      changed: isEqual(entryOld, entryNew) ? "same" : "modified",
    });

    if (bytesEndOld >= bytesEndNew) {
      indexNew++;
    }

    if (bytesEndNew >= bytesEndOld) {
      indexOld++;
    }

    bytesIndex = currBytesEndMin + 1;
  }

  // We can delete variables, compared to old storage
  while (indexOld < storageOldLength) {
    const entry = storageOld[indexOld];
    comparisonTable.push({
      bytesStart: bytesIndex,
      bytesEnd: entry.bytesEnd,
      entryOld: `${entry.label}: ${entry.type}`,
      changed: "delete",
    });

    indexOld++;
    bytesIndex = entry.bytesEnd + 1;
  }

  // We can append variables, compared to old storage
  while (indexNew < storageNewLength) {
    const entry = storageNew[indexNew];
    comparisonTable.push({
      bytesStart: bytesIndex,
      bytesEnd: entry.bytesEnd,
      entryNew: `${entry.label}: ${entry.type}`,
      changed: "append",
    });

    indexNew++;
    bytesIndex = entry.bytesEnd + 1;
  }

  return comparisonTable;
}

async function compile(): Promise<void> {
  for (let compiler of hre.config.solidity.compilers) {
    compiler.settings.outputSelection['*']['*'].push('storageLayout');
  }
  await hre.run("compile");
}

async function getComparison(oldFullQualifiedName: string, newFullQualifiedName: string): Promise<ComparisonEntry[]> {
  await compile();
  const storageOld = await getStorageLayout(oldFullQualifiedName);
  const storageNew = await getStorageLayout(newFullQualifiedName);
  return compareStorageLayouts(storageOld, storageNew);
}

async function isStorageLayoutModified(oldFullQualifiedName: string, newFullQualifiedName: string): Promise<boolean> {
  const compareData = await getComparison(oldFullQualifiedName, newFullQualifiedName);
  return compareData.filter((entry) => entry.changed === "modified" && !entry.entryOld?.startsWith("__gap_")).length > 0;
}

export {
  isStorageLayoutModified,
};
