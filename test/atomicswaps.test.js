const { describe } = require('riteway')
const eoslime = require('eoslime').init('local')
const ecc = require('eosjs-ecc')

require('dotenv').config()
const updateDotenv = require('update-dotenv')

const  { SWAPS_PRIVATE_KEY, ISSUER_PRIVATE_KEY, TOKEN_PRIVATE_KEY } = process.env

const privateKeys = {
  swaps: SWAPS_PRIVATE_KEY,
  issuer: ISSUER_PRIVATE_KEY,
  token: TOKEN_PRIVATE_KEY
}

const TOKEN_WASM_PATH = './eosio.token.wasm'
const TOKEN_ABI_PATH = './eosio.token.abi'
const SWAPS_WASM_PATH = './atomicswaps.wasm'
const SWAPS_ABI_PATH = './atomicswaps.abi'

const amount = '1000.0000 TLOS'
let swapsAccount, tokenAccount, issuerAccount, buyerAccount, sellerAccount,
    tokenContract, swapsContract = null

const savePrivateKey = async (account, privateKey) => {
  privateKeys[account] = privateKey
  
  await updateDotenv({
    [`${account.toUpperCase()}_PRIVATE_KEY`]: privateKey  
  })
}

const fromHexString = hexString =>
  new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))

const getBalance = (account) =>
  eoslime.Provider.eos.getCurrencyBalance('eosio.token', account, 'TLOS').then(balance => {
    return Number.parseFloat(balance[0]) || Number(0).toFixed(4)
  })
  
const TIMEOUT_IN_SECONDS = 3
const waitUntilRefund = () => new Promise(resolve => setTimeout(resolve, TIMEOUT_IN_SECONDS * 1000))

const generateSecretAndHash = async () => {
  const secretValue = ecc.sha256(await ecc.unsafeRandomKey())
  console.log(`secret value: ${secretValue}`)

  const secretHash = ecc.sha256(fromHexString(secretValue)).toString('hex')
  console.log(`secret hash: ${secretHash}`)
  
  return [ secretValue, secretHash ]
}

const trxAssertWrapper = assert => async (action, args, msg) => {
  const { transaction_id } = await action(...args)
  
  assert({
    given: `tx ${transaction_id}`,
    should: msg,
    actual: true,
    expected: true
  })
}

describe('Successful exchange', async assert => {
  const assertTrx = trxAssertWrapper(assert)
  
  await setupContracts()

  const [ secretValue, secretHash ] = await generateSecretAndHash()

  const sellerInitialBalance = await getBalance(sellerAccount.name)
  const buyerInitialBalance = await getBalance(buyerAccount.name)

  await assertTrx(tokenContract.transfer, [
    sellerAccount.name, swapsAccount.name, amount, '',
    { from: sellerAccount }
  ], `deposit tokens from ${sellerAccount.name} to ${swapsAccount.name}`)

  await assertTrx(swapsContract.open, [
    sellerAccount.name, buyerAccount.name, amount, secretHash,
    { from: sellerAccount }
  ], `open exchange between ${sellerAccount.name} and ${buyerAccount.name}`)

  await assertTrx(swapsContract.close, [
    sellerAccount.name, buyerAccount.name, secretValue,
    { from: buyerAccount }
  ], `close exchange between ${sellerAccount.name} and ${buyerAccount.name} (success)`)

  await assertTrx(swapsContract.withdraw, [
    buyerAccount.name, amount,
    { from: buyerAccount }
  ], `withdraw tokens from ${swapsAccount.name} to ${buyerAccount.name} (${amount})`)

  const sellerFinalBalance = await getBalance(sellerAccount.name)
  const buyerFinalBalance = await getBalance(buyerAccount.name)
  
  assert({
    given: 'final seller balance',
    should: 'be less than initial balance',
    actual: sellerFinalBalance < sellerInitialBalance,
    expected: true
  })
  
  assert({
    given: 'final buyer balance',
    should: 'be more than initial balance',
    actual: buyerFinalBalance > buyerInitialBalance,
    expected: true
  })
})

describe('Refunded exchange', async assert => {
  const assertTrx = trxAssertWrapper(assert)
  
  await setupContracts()
  
  const [ secretValue, secretHash ] = await generateSecretAndHash()
  
  const sellerInitialBalance = await getBalance(sellerAccount.name)
  const buyerInitialBalance = await getBalance(buyerAccount.name)
  
  await assertTrx(tokenContract.transfer, [
    sellerAccount.name, swapsAccount.name, amount, '',
    { from: sellerAccount }
  ], `deposit tokens from ${sellerAccount.name} to ${swapsAccount.name}`)

  await assertTrx(swapsContract.open, [
    sellerAccount.name, buyerAccount.name, amount, secretHash,
    { from: sellerAccount }
  ], `open exchange between ${sellerAccount.name} and ${buyerAccount.name}`)
  
  await waitUntilRefund()

  await assertTrx(swapsContract.close, [
    sellerAccount.name, buyerAccount.name, secretValue,
    { from: sellerAccount }
  ], `close exchange between ${sellerAccount.name} and ${buyerAccount.name} (refund)`)
  
  await assertTrx(swapsContract.withdraw, [
    sellerAccount.name, amount,
    { from: sellerAccount }
  ], `withdraw tokens from ${swapsAccount.name} to ${sellerAccount.name} (${amount})`)
  
  const sellerFinalBalance = await getBalance(sellerAccount.name)
  const buyerFinalBalance = await getBalance(buyerAccount.name)
  
  assert({
    given: 'final seller balance',
    should: 'be equal to initial balance',
    actual: sellerFinalBalance === sellerInitialBalance,
    expected: true
  })
  
  assert({
    given: 'final buyer balance',
    should: 'be equal to initial balance',
    actual: buyerFinalBalance === buyerInitialBalance,
    expected: true
  })
})

const setupContracts = async () => {
  try {
    swapsAccount = await eoslime.Account.createFromName('atomicswaps1')
    console.log(`created swaps account: ${swapsAccount.name}`)

    await savePrivateKey('swaps', swapsAccount.privateKey)
  } catch (e) {
    swapsAccount = await eoslime.Account.load('atomicswaps1', privateKeys.swaps)
    console.log(`loaded swaps account: ${swapsAccount.name}`)
  }
  
  try {
    swapsContract = await eoslime.Contract.deployOnAccount(SWAPS_WASM_PATH, SWAPS_ABI_PATH, swapsAccount, { inline: true })
    console.log(`deployed swaps contract to ${swapsAccount.name}`)
  } catch (e) {
    swapsContract = await eoslime.Contract.fromFile(SWAPS_ABI_PATH, 'atomicswaps1')
    console.log(`loaded swaps contract: ${swapsAccount.name}`)
  }
  
  try {
    tokenAccount = await eoslime.Account.createFromName('eosio.token')
    console.log(`created token account: ${tokenAccount.name}`)

    await savePrivateKey('token', tokenAccount.privateKey)

    issuerAccount = await eoslime.Account.createFromName('issuer')
    console.log(`created issuer account: ${issuerAccount.name}`)

    await savePrivateKey('issuer', issuerAccount.privateKey)

    tokenContract = await eoslime.Contract.deployOnAccount(TOKEN_WASM_PATH, TOKEN_ABI_PATH, tokenAccount)
    console.log(`deployed token contract to ${tokenAccount.name}`)

    const supplyAmount = `${(Number.parseInt(amount) * 1000).toFixed(4)} TLOS`
    await tokenContract.create(issuerAccount.name, supplyAmount)
    await tokenContract.issue(issuerAccount.name, supplyAmount, '', { from: issuerAccount })
    console.log(`created tokens for ${issuerAccount.name} (${supplyAmount})`)
  } catch (e) {
    tokenAccount = await eoslime.Account.load('eosio.token', privateKeys.token)
    console.log(`loaded token account: ${tokenAccount.name}`)
    
    issuerAccount = await eoslime.Account.load('issuer', privateKeys.issuer)
    console.log(`loaded issuer account: ${issuerAccount.name}`)

    tokenContract = await eoslime.Contract.fromFile(TOKEN_ABI_PATH, 'eosio.token')
    console.log(`loaded token contract: ${tokenContract.name}`)
  }
  
  buyerAccount = await eoslime.Account.createRandom()
  console.log(`created buyer account: ${buyerAccount.name}`)
  
  sellerAccount = await eoslime.Account.createRandom()
  console.log(`created seller account: ${sellerAccount.name}`)
  
  await tokenContract.transfer(issuerAccount.name, sellerAccount.name, amount, '', { from: issuerAccount })
  console.log(`sent tokens to seller ${sellerAccount.name} (${amount})`)
}