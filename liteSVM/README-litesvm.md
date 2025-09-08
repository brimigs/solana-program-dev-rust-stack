# LiteSVM

[LiteSVM](https://github.com/LiteSVM/litesvm) is a lightweight library for testing Solana Programs that works by creating an in-process Solana VM optimized for program developers. Unlike other testing approaches that spin up separate validator processes, LiteSVM embeds the VM inside your tests, making
them execute much faster.

It handles the complexity of managing accounts, deploying programs, and processing transactions behind a simple API. The framework automatically manages blockchain state between transactions, so you don't need to manually track account
changes or balances. This makes LiteSVM particularly well-suited for integration tests where you need to simulate realistic transaction flows and verify program behavior across multiple operations.

This creates a the basic test environment, which includes all runtime features enabled, default sysvars, precompiles, spl programs, sigverify, and all built in programs like the system program.

### Custom Configuration

```rust
use litesvm::LiteSVM;
use solana_compute_budget::compute_budget::ComputeBudget;

#[test]
fn test_custom_config() {
    // Start from scratch and configure everything manually
    let mut svm = LiteSVM::default()
        .with_compute_budget(ComputeBudget {
            compute_unit_limit: 200_000,
            heap_size: 32_768,
            ..ComputeBudget::default()
        })
        .with_sigverify(false) // Disable signature verification
        .with_blockhash_check(false) // Enable blockhash checking
        .with_transaction_history(100) // Keep last 100 transactions
        .with_lamports(10_000_000_000_000); // 10,000 SOL for testing
}
```

The svm test environment can be customized as needed for your specific testing needs, the example above shows one of the several ways you can customize your test environment.

## Deploying Programs

If you have a program that CPIs into other programs, you will need to have those programs deployed onto your test environment. The initial test environment set up only includes builtins.

For example, if your program is using data feeds from Pyth, you will need to have the Pyth program deployed to your test environment.

### Method 1: From File

```rust
use litesvm::LiteSVM;
use solana_pubkey::Pubkey;

#[test]
fn test_deploy_from_file() {
    let mut svm = LiteSVM::new();

    // Deploy a program from a compiled .so file
    let program_id = Pubkey::new_unique();
    svm.add_program_from_file(
        program_id,
        "path/to/program.so"
    ).unwrap();

    // Program is now deployed and ready to use
}
```

### Method 2: From Bytes

```rust
use litesvm::LiteSVM;
use solana_pubkey::Pubkey;

#[test]
fn test_deploy_from_bytes() {
    let mut svm = LiteSVM::new();

    // Include the program bytes at compile time
    let program_bytes = include_bytes!("../target/deploy/my_program.so");

    let program_id = Pubkey::new_unique();
    svm.add_program(program_id, program_bytes).unwrap();
}
```

### Method 3: Pulling from a cluster

You can pull a program from any cluster and then deploy it, below is an example for pulling the Pyth Oracle Program from devnet.

```bash
# First, dump the program from mainnet
solana program dump <PROGRAM_ID> my_program.so --url devnet
```

Then load it in your tests:

```rust
let pyth_mainnet_program_id = pubkey!("gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s");
svm.add_program_from_file(pyth_mainnet_program_id, "my_program.so").unwrap();
```

## Sending Transactions

### Basic Transaction

```rust
use litesvm::LiteSVM;
use solana_transaction::Transaction;
use solana_message::Message;
use solana_instruction::Instruction;
use solana_keypair::Keypair;
use solana_signer::Signer;
use solana_system_interface::instruction::transfer;

#[test]
fn test_basic_transaction() {
    let mut svm = LiteSVM::new();

    // Create accounts
    let sender = Keypair::new();
    let receiver = Keypair::new();

    // Fund the sender
    svm.airdrop(&sender.pubkey(), 1_000_000_000).unwrap(); // 1 SOL

    // Create a transfer instruction
    let instruction = transfer(
        &sender.pubkey(),
        &receiver.pubkey(),
        500_000_000, // 0.5 SOL
    );

    // Create and send transaction
    let tx = Transaction::new(
        &[&sender],
        Message::new(&[instruction], Some(&sender.pubkey())),
        svm.latest_blockhash(),
    );

    let result = svm.send_transaction(tx);

    // Check the result
    match result {
        Ok(meta) => {
            println!("Transaction successful!");
            println!("Compute units used: {}", meta.compute_units_consumed);
            println!("Logs: {:?}", meta.logs);
        }
        Err(e) => {
            println!("Transaction failed: {:?}", e);
        }
    }

    // Verify balances
    assert_eq!(svm.get_balance(&receiver.pubkey()).unwrap(), 500_000_000);
}
```

### Building a custom transaction from your program

```rust
fn create_journal_entry_instruction(
    title: String,
    message: String,
    owner: &Pubkey,
) -> Instruction {
    let (journal_entry_pda, _) = get_journal_entry_pda(&title, owner);

    Instruction {
        program_id: crud::ID,
        accounts: vec![
            AccountMeta::new(journal_entry_pda, false),
            AccountMeta::new(*owner, true),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: crud::instruction::CreateJournalEntry { title, message }.data(),
    }
}

let ix = create_journal_entry_instruction(
    title.clone(),
    message.clone(),
    &admin.pubkey(),
);
```

### Simulating Transactions

```rust
use litesvm::LiteSVM;

#[test]
fn test_simulate_transaction() {
    let mut svm = LiteSVM::new();

    // ... setup transaction ...

    // Simulate without modifying state
    let sim_result = svm.simulate_transaction(transaction);

    match sim_result {
        Ok(info) => {
            println!("Simulation successful!");
            println!("Would consume {} compute units", info.meta.compute_units_consumed);
            // State is NOT modified
        }
        Err(e) => {
            println!("Simulation failed: {:?}", e.meta.logs);
        }
    }
}
```

## Working with Accounts

### Reading Accounts

```rust
use litesvm::LiteSVM;
use solana_pubkey::Pubkey;

#[test]
fn test_read_accounts() {
    let svm = LiteSVM::new();
    let account_key = Pubkey::new_unique();

    // Get full account data
    if let Some(account) = svm.get_account(&account_key) {
        println!("Lamports: {}", account.lamports);
        println!("Owner: {}", account.owner);
        println!("Data length: {}", account.data.len());
        println!("Executable: {}", account.executable);
    }

    // Get just the balance
    if let Some(balance) = svm.get_balance(&account_key) {
        println!("Balance: {} lamports", balance);
    }
}
```

### Writing Arbitrary Accounts

LiteSVM allows you to create any account state, even if it wouldn't be possible in production:

```rust
use litesvm::LiteSVM;
use solana_account::Account;
use solana_pubkey::Pubkey;
use spl_token::state::{Account as TokenAccount, AccountState};
use solana_program_option::COption;
use solana_program_pack::Pack;

#[test]
fn test_create_token_account() {
    let mut svm = LiteSVM::new();

    let owner = Pubkey::new_unique();
    let mint = Pubkey::new_unique();
    let token_account_key = Pubkey::new_unique();

    // Create a token account with 1 million tokens
    let token_account = TokenAccount {
        mint,
        owner,
        amount: 1_000_000_000_000,
        delegate: COption::None,
        state: AccountState::Initialized,
        is_native: COption::None,
        delegated_amount: 0,
        close_authority: COption::None,
    };

    let mut data = vec![0u8; TokenAccount::LEN];
    TokenAccount::pack(token_account, &mut data).unwrap();

    // Write the account
    svm.set_account(
        token_account_key,
        Account {
            lamports: 2_039_280, // Rent-exempt amount
            data,
            owner: spl_token::id(),
            executable: false,
            rent_epoch: 0,
        }
    ).unwrap();

    // Account is now available for testing!
}
```

### Airdropping Funds

```rust
use litesvm::LiteSVM;
use solana_keypair::Keypair;
use solana_signer::Signer;

#[test]
fn test_airdrop() {
    let mut svm = LiteSVM::new();

    let user = Keypair::new();

    // Airdrop 10 SOL
    let result = svm.airdrop(&user.pubkey(), 10_000_000_000);

    assert!(result.is_ok());
    assert_eq!(svm.get_balance(&user.pubkey()).unwrap(), 10_000_000_000);
}
```

## Time Travel and Slot Manipulation

### Manipulating the Clock

```rust
use litesvm::LiteSVM;
use solana_clock::Clock;

#[test]
fn test_time_travel() {
    let mut svm = LiteSVM::new();

    // Get current clock
    let mut clock: Clock = svm.get_sysvar();
    println!("Current slot: {}", clock.slot);
    println!("Current unix timestamp: {}", clock.unix_timestamp);

    // Jump to the future!
    clock.slot = 1000;
    clock.unix_timestamp = 1735689600; // Jan 1, 2025
    clock.epoch = 10;
    svm.set_sysvar(&clock);

    // Now any program that reads Clock will see the new time
}
```

### Warping to a Specific Slot

```rust
use litesvm::LiteSVM;

#[test]
fn test_warp_to_slot() {
    let mut svm = LiteSVM::new();

    // Jump directly to slot 1000
    svm.warp_to_slot(1000);

    // Useful for testing time-locked features
}
```

### Expiring Blockhashes

```rust
use litesvm::LiteSVM;

#[test]
fn test_expire_blockhash() {
    let mut svm = LiteSVM::new();

    let initial_blockhash = svm.latest_blockhash();

    // Expire the current blockhash
    svm.expire_blockhash();

    let new_blockhash = svm.latest_blockhash();
    assert_ne!(initial_blockhash, new_blockhash);

    // Old transactions will now fail with BlockhashNotFound
}
```

## Advanced Features

### Custom Sysvars

```rust
use litesvm::LiteSVM;
use solana_rent::Rent;
use solana_epoch_schedule::EpochSchedule;

#[test]
fn test_custom_sysvars() {
    let mut svm = LiteSVM::new();

    // Set custom rent
    let rent = Rent {
        lamports_per_byte_year: 3480,
        exemption_threshold: 2.0,
        burn_percent: 50,
    };
    svm.set_sysvar(&rent);

    // Set custom epoch schedule
    let epoch_schedule = EpochSchedule {
        slots_per_epoch: 432_000,
        leader_schedule_slot_offset: 432_000,
        warmup: false,
        first_normal_epoch: 0,
        first_normal_slot: 0,
    };
    svm.set_sysvar(&epoch_schedule);
}
```

### Disabling Security Features (for testing)

```rust
use litesvm::LiteSVM;

#[test]
fn test_disable_security() {
    let mut svm = LiteSVM::default()
        .with_sigverify(false)       // Skip signature verification
        .with_blockhash_check(false) // Skip blockhash validation
        .with_transaction_history(0); // Allow duplicate transactions

    // Useful for testing edge cases and error conditions
}
```

### Accessing Transaction History

```rust
use litesvm::LiteSVM;
use solana_signature::Signature;

#[test]
fn test_transaction_history() {
    let mut svm = LiteSVM::new()
        .with_transaction_history(100); // Keep last 100 transactions

    // ... send some transactions ...

    // Look up a previous transaction
    let signature = Signature::new_unique();
    if let Some(tx_result) = svm.get_transaction(&signature) {
        match tx_result {
            Ok(meta) => println!("Transaction found: {:?}", meta.logs),
            Err(e) => println!("Transaction failed: {:?}", e),
        }
    }
}
```

### Custom Compute Budget

```rust
use litesvm::LiteSVM;
use solana_compute_budget::compute_budget::ComputeBudget;

#[test]
fn test_compute_budget() {
    let mut svm = LiteSVM::new()
        .with_compute_budget(ComputeBudget {
            compute_unit_limit: 1_400_000,
            heap_size: 256 * 1024, // 256KB heap
            stack_frame_size: 4096,
            log_pubkey_units: 100,
            ..ComputeBudget::default()
        });

    // Test compute-intensive operations
}
```

## Testing Best Practices

### 1. Use Helper Functions

```rust
use litesvm::LiteSVM;
use solana_keypair::Keypair;
use solana_pubkey::Pubkey;
use solana_signer::Signer;

fn setup_test_environment() -> (LiteSVM, Keypair, Pubkey) {
    let mut svm = LiteSVM::new();
    let payer = Keypair::new();
    let program_id = Pubkey::new_unique();

    // Common setup
    svm.airdrop(&payer.pubkey(), 10_000_000_000).unwrap();
    svm.add_program_from_file(program_id, "program.so").unwrap();

    (svm, payer, program_id)
}

#[test]
fn test_something() {
    let (mut svm, payer, program_id) = setup_test_environment();
    // Your test here
}
```

### 2. Test Error Cases

```rust
use litesvm::LiteSVM;

#[test]
fn test_insufficient_funds() {
    let mut svm = LiteSVM::new();

    // ... create transaction that requires more funds than available ...

    let result = svm.send_transaction(tx);
    assert!(result.is_err());

    if let Err(failed) = result {
        assert_eq!(failed.err, TransactionError::InsufficientFundsForFee);
        // Check logs for debugging info
        println!("Error logs: {:?}", failed.meta.logs);
    }
}
```

### 3. Snapshot Testing Pattern

```rust
use litesvm::LiteSVM;

#[test]
fn test_complex_scenario() {
    let mut svm = LiteSVM::new();

    // Setup initial state
    setup_accounts(&mut svm);

    // Take snapshot of initial state
    let initial_balance = svm.get_balance(&account).unwrap();

    // Execute operations
    execute_program_logic(&mut svm);

    // Verify state changes
    let final_balance = svm.get_balance(&account).unwrap();
    assert_eq!(final_balance, initial_balance + expected_change);
}
```

## Common Patterns

### Testing PDA Derivation

```rust
use litesvm::LiteSVM;
use solana_pubkey::Pubkey;

#[test]
fn test_pda() {
    let mut svm = LiteSVM::new();

    let program_id = Pubkey::new_unique();
    let seed = b"my_pda";

    let (pda, bump) = Pubkey::find_program_address(
        &[seed],
        &program_id
    );

    // Create an account at the PDA
    svm.set_account(pda, Account {
        lamports: 1_000_000,
        data: vec![bump], // Store bump seed
        owner: program_id,
        executable: false,
        rent_epoch: 0,
    }).unwrap();
}
```

### Testing Cross-Program Invocations (CPI)

```rust
use litesvm::LiteSVM;

#[test]
fn test_cpi() {
    let mut svm = LiteSVM::new();

    // Deploy both programs
    let program_a = Pubkey::new_unique();
    let program_b = Pubkey::new_unique();

    svm.add_program_from_file(program_a, "program_a.so").unwrap();
    svm.add_program_from_file(program_b, "program_b.so").unwrap();

    // Create instruction that will CPI to program_b
    let instruction = Instruction {
        program_id: program_a,
        accounts: vec![
            AccountMeta::new(account_key, false),
            AccountMeta::new_readonly(program_b, false),
        ],
        data: instruction_data,
    };

    // Execute - CPI will work seamlessly
    let result = svm.send_transaction(tx);
}
```

### Testing with Real Mainnet Accounts

```rust
use litesvm::LiteSVM;

#[test]
fn test_with_mainnet_state() {
    let mut svm = LiteSVM::new();

    // First, dump account from mainnet:
    // solana account <ADDRESS> --output json --url mainnet-beta > account.json

    // Load in test
    let account_data = std::fs::read_to_string("account.json").unwrap();
    let account: Account = serde_json::from_str(&account_data).unwrap();

    let address = pubkey!("YourMainnetAddress11111111111111111111111");
    svm.set_account(address, account).unwrap();

    // Test with real mainnet state
}
```

## Performance Tips

1. **Reuse SVM instances** when possible instead of creating new ones
2. **Use simulate_transaction** for read-only operations
3. **Disable unnecessary features** like signature verification in tests
4. **Batch operations** when setting up complex state
5. **Use include_bytes!** for programs to avoid runtime file I/O

## Troubleshooting

### Common Issues and Solutions

**Issue**: "Program not found"

```rust
// Solution: Ensure program is deployed before sending transactions
svm.add_program(program_id, &program_bytes)?;
```

**Issue**: "Blockhash not found"

```rust
// Solution: Use the latest blockhash
let blockhash = svm.latest_blockhash();
```

**Issue**: "Insufficient funds"

```rust
// Solution: Airdrop sufficient funds
svm.airdrop(&payer.pubkey(), 10_000_000_000)?;
```

**Issue**: "Account not found"

```rust
// Solution: Create the account first
svm.set_account(address, account_data)?;
```

## Summary

LiteSVM provides a powerful, fast, and flexible testing environment for Solana programs. Its key strengths are:

- **Speed**: In-process execution eliminates network overhead
- **Control**: Direct manipulation of time, accounts, and state
- **Simplicity**: Intuitive API that gets out of your way
- **Flexibility**: Extensive configuration options for advanced scenarios

Start with `LiteSVM::new()` for most cases, and explore the advanced features as your testing needs grow more complex.
