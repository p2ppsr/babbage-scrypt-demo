import { Demo } from './src/contracts/demo'
import { SmartContract, sha256, toByteString } from 'scrypt-ts'
import {
    createAction,
    CreateActionResult,
    getTransactionOutputs,
    GetTransactionOutputResult,
} from '@babbage/sdk-ts'

const verifyTruthy = <T>(v: T | null | undefined): T => {
    if (v == null) {
        throw new Error('A bad thing has happened.')
    }
    return v
}

const deploy = async (
    instance: SmartContract,
    satoshis: number,
    description: string,
    basket?: string,
    metadata?: string
): Promise<CreateActionResult> => {
    return await createAction({
        description,
        inputs: {},
        outputs: [
            {
                script: instance.lockingScript.toHex(),
                satoshis,
                basket,
                customInstructions: metadata,
            },
        ],
    })
}

interface ListResult<T extends SmartContract>
    extends GetTransactionOutputResult {
    contract: T
}

const list = async <T extends SmartContract>(
    basket: string,
    contractHydrator: (lockingScript: string) => T
): Promise<ListResult<T>[]> => {
    const outputs = await getTransactionOutputs({
        basket,
        spendable: true,
        includeEnvelope: true,
        includeCustomInstructions: true,
    })
    const contracts: ListResult<T>[] = []
    for (let i = 0; i < outputs.length; i++) {
        contracts.push({
            ...outputs[i],
            contract: contractHydrator(outputs[i].outputScript),
        })
    }
    return contracts
}

const redeem = async (
    listResult: ListResult<SmartContract>,
    description: string
): Promise<CreateActionResult> => {
    return await createAction({
        inputs: {
            [listResult.txid]: {
                ...verifyTruthy(listResult.envelope),
                outputsToRedeem: [
                    {
                        index: listResult.vout,
                        unlockingScript: await listResult.contract
                            .getUnlockingScript(() => {})
                            .toHex(),
                    },
                ],
            },
        },
        description,
        outputs: [],
    })
}

async function main() {
    await Demo.compile()
    const instance = new Demo(sha256(toByteString('hello world', true)))
    const deployTX = await deploy(
        instance,
        1000,
        'Deploy a smart contract',
        'tests'
    )
    console.log('deployed', deployTX.txid)
    const contracts = await list('tests', (lockingScript: string) => {
        return Demo.fromLockingScript(lockingScript) as Demo
    })
    console.log('listed', contracts)
    contracts[0].contract.unlock(toByteString('hello world', true))
    const redeemTX = await redeem(contracts[0], 'redeem a smart contract')
    console.log('REDEEMED!!', redeemTX.txid)
}

main()
