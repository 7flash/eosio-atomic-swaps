const { describe } = require('riteway')
const eoslime = require('eoslime').init('local')

const TOKEN_WASM_PATH = './eosio.token.wasm'
const TOKEN_ABI_PATH = './eosio.token.abi'
const SWAPS_WASM_PATH = './swaps.wasm'
const SWAPS_ABI_PATH = './swaps.abi'

const deployOrInit = async (wasm, abi, account) => {
  let contract = null
  try {
    contract = await eoslime.AccountDeployer.deploy(wasm, abi, account, { inline: true })
  } catch (err) {
    contract = eoslime.Contract(abi, account.name)
  }
  return contract
}

const getTokenContract = account => deployOrInit(TOKEN_WASM_PATH, TOKEN_ABI_PATH, account)
const getSwapsContract = account => deployOrInit(TRACKER_WASM_PATH, TRACKER_ABI_PATH, account)

const init = async () => {
  try {
    const tokenAccount = await eoslime.Account.createFromName('eosio.token')
    const buyerAccount = await eoslime.Account.createFromName('tokenbuyer')
    const sellerAccount = await eoslime.Account.createFromName('tokenseller')
    const issuerAccount = await eoslime.Account.createFromName('tokenissuer')

    const tokenContract = await eoslime.AccountDeployer.deploy(TOKEN_WASM_PATH, TOKEN_ABI_PATH, tokenAccount)
    
    await tokenContract.create(issuerAccount.name, '1000000.0000 TLOS')
    await tokenContract.issue(issuerAccount.name, '1000000.0000 TLOS', '', { from: issuerAccount })
    await tokenContract.transfer(issuerAccount.name, sellerAccount.name, '1000000.0000 TLOS', '', { from: issuerAccount })
  
    await writeFile('token.privateKey', tokenAccount.privateKey)
    await writeFile('buyer.privateKey', buyerAccount.privateKey)
    await writeFile('seller.privateKey', sellerAccount.privateKey)
    await writeFile('issuer.privateKey', issuerAccount.privateKey)
  } catch (err) {
  }
}

describe.only('Swaps', async assert => {
  const swapsAccount = await eoslime.Account.createRandom()
  const tokenAccount = await eoslime.Account.createRandom()
  const issuerAccount = await eoslime.Account.createRandom()
  const buyerAccount = await eoslime.Account.createRandom()
  const sellerAccount = await eoslime.Account.createRandom()
  
  const tokenContract = await eoslime.AccountDeployer.deploy(TOKEN_WASM_PATH, TOKEN_ABI_PATH, tokenAccount)
  await tokenContract.create(issuerAccount.name, '1000000.0000 TLOS')
  await tokenContract.issue(issuerAccount.name, '1000000.0000 TLOS', '', { from: issuerAccount })
  await tokenContract.transfer(issuerAccount.name, sellerAccount.name, '1000000.0000 TLOS', '', { from: issuerAccount })
})